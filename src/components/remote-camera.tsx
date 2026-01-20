"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Camera, Video, VideoOff, RefreshCw, 
  Laptop, Smartphone, Circle, Lock, Check, X,
  Maximize2, Minimize2, RotateCcw, Download,
  FlipHorizontal, Settings, AlertCircle
} from 'lucide-react'
import { DevicePair, supabase, AccessRequest } from '@/lib/supabase'
import { Button } from '@/components/ui/button'

interface RemoteCameraProps {
  devices: DevicePair[]
  currentDevice: DevicePair | null
}

interface CameraSession {
  id: string
  host_device_id: string
  viewer_device_id: string
  status: 'waiting' | 'active' | 'ended'
  created_at: string
}

export function RemoteCamera({ devices, currentDevice }: RemoteCameraProps) {
  const [selectedDevice, setSelectedDevice] = useState<DevicePair | null>(null)
  const [accessStatus, setAccessStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none')
  const [pendingRequests, setPendingRequests] = useState<AccessRequest[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [isHostStreaming, setIsHostStreaming] = useState(false)
  const [waitingSession, setWaitingSession] = useState<CameraSession | null>(null)
  const [loading, setLoading] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const [isFullscreen, setIsFullscreen] = useState(false)
  
  const videoRef = useRef<HTMLVideoElement>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const checkForWaitingSessions = useCallback(async () => {
    if (!currentDevice) return

    const { data } = await supabase
      .from('camera_sessions')
      .select('*')
      .eq('host_device_id', currentDevice.id)
      .eq('status', 'waiting')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (data) {
      setWaitingSession(data)
    } else {
      setWaitingSession(null)
    }
  }, [currentDevice])

  const fetchPendingRequests = useCallback(async () => {
    if (!currentDevice) return
    
    const { data } = await supabase
      .from('access_requests')
      .select('*')
      .eq('target_device_id', currentDevice.id)
      .eq('status', 'pending')
      .eq('request_type', 'camera_access')
    
    if (data) setPendingRequests(data)
  }, [currentDevice])

  useEffect(() => {
    if (currentDevice) {
      fetchPendingRequests()
      checkForWaitingSessions()

      const requestChannel = supabase
        .channel(`camera-requests-for-${currentDevice.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'access_requests',
            filter: `target_device_id=eq.${currentDevice.id}`
          },
          () => {
            fetchPendingRequests()
          }
        )
        .subscribe()

      const sessionChannel = supabase
        .channel(`camera-sessions-host-${currentDevice.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'camera_sessions',
            filter: `host_device_id=eq.${currentDevice.id}`
          },
          () => {
            checkForWaitingSessions()
          }
        )
        .subscribe()

      const pollInterval = setInterval(checkForWaitingSessions, 3000)

      return () => {
        supabase.removeChannel(requestChannel)
        supabase.removeChannel(sessionChannel)
        clearInterval(pollInterval)
      }
    }
  }, [currentDevice, fetchPendingRequests, checkForWaitingSessions])

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  const handleDeviceSelect = async (device: DevicePair) => {
    if (device.id === currentDevice?.id) return

    setSelectedDevice(device)
    setLoading(true)
    setIsStreaming(false)

    const { data: existingRequest } = await supabase
      .from('access_requests')
      .select('*')
      .eq('requester_device_id', currentDevice?.id)
      .eq('target_device_id', device.id)
      .eq('request_type', 'camera_access')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (existingRequest) {
      setAccessStatus(existingRequest.status as 'pending' | 'approved' | 'rejected')
    } else {
      setAccessStatus('none')
    }
    
    setLoading(false)
  }

  const sendAccessRequest = async () => {
    if (!currentDevice || !selectedDevice) return
    
    setLoading(true)
    
    const { error } = await supabase
      .from('access_requests')
      .insert([{
        requester_device_id: currentDevice.id,
        target_device_id: selectedDevice.id,
        request_type: 'camera_access',
        status: 'pending'
      }])

    if (!error) {
      setAccessStatus('pending')
    }
    
    setLoading(false)
  }

  const handleRequestResponse = async (requestId: string, status: 'approved' | 'rejected') => {
    await supabase
      .from('access_requests')
      .update({ status, responded_at: new Date().toISOString() })
      .eq('id', requestId)
    
    fetchPendingRequests()
  }

  const startHostCamera = async () => {
    if (!currentDevice || !waitingSession) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: false
      })

      streamRef.current = stream

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
        localVideoRef.current.play().catch(console.error)
      }

      await supabase
        .from('camera_sessions')
        .update({ status: 'active' })
        .eq('id', waitingSession.id)

      setIsHostStreaming(true)
      setWaitingSession(null)
    } catch (err) {
      console.error('Failed to start camera:', err)
    }
  }

  const stopHostCamera = async () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null
    }

    setIsHostStreaming(false)

    if (currentDevice) {
      await supabase
        .from('camera_sessions')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('host_device_id', currentDevice.id)
        .in('status', ['active', 'waiting'])
    }
  }

  const switchCamera = async () => {
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(newFacingMode)

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: newFacingMode },
          audio: false
        })

        streamRef.current = stream

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
        }
      } catch (err) {
        console.error('Failed to switch camera:', err)
      }
    }
  }

  const requestViewCamera = async () => {
    if (!currentDevice || !selectedDevice) return

    setLoading(true)

    await supabase
      .from('camera_sessions')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('host_device_id', selectedDevice.id)
      .eq('viewer_device_id', currentDevice.id)
      .in('status', ['active', 'waiting'])

    await supabase
      .from('camera_sessions')
      .insert([{
        host_device_id: selectedDevice.id,
        viewer_device_id: currentDevice.id,
        status: 'waiting'
      }])

    setLoading(false)
    setIsStreaming(true)
  }

  const stopViewing = async () => {
    setIsStreaming(false)

    if (currentDevice && selectedDevice) {
      await supabase
        .from('camera_sessions')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('host_device_id', selectedDevice.id)
        .eq('viewer_device_id', currentDevice.id)
        .in('status', ['active', 'waiting'])
    }
  }

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (containerRef.current?.requestFullscreen) {
          await containerRef.current.requestFullscreen()
          setIsFullscreen(true)
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen()
          setIsFullscreen(false)
        }
      }
    } catch (error) {
      console.error('Fullscreen error:', error)
    }
  }

  const getViewerDeviceName = () => {
    if (!waitingSession) return 'Unknown'
    const device = devices.find(d => d.id === waitingSession.viewer_device_id)
    return device?.device_name || 'Unknown Device'
  }

  const remoteDevices = devices.filter(d => d.id !== currentDevice?.id)

  return (
    <div className="h-full flex flex-col md:flex-row">
      <div className="hidden md:flex w-72 glass-panel border-r border-[#2a2a3a] p-4 flex-col">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Camera className="w-5 h-5 text-[#b829dd]" />
          Remote Camera
        </h2>

        <div className="space-y-2 mb-6">
          {remoteDevices.length > 0 ? (
            remoteDevices.map(device => (
              <button
                key={device.id}
                onClick={() => handleDeviceSelect(device)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  selectedDevice?.id === device.id
                    ? 'bg-[#b829dd]/20 border border-[#b829dd]/50'
                    : 'bg-[#1a1a24] hover:bg-[#1a1a24]/80'
                }`}
              >
                {device.device_name.toLowerCase().includes('phone') || device.device_name.toLowerCase().includes('mobile') ? (
                  <Smartphone className="w-5 h-5 text-[#b829dd]" />
                ) : (
                  <Laptop className="w-5 h-5 text-[#b829dd]" />
                )}
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-white">{device.device_name}</p>
                  <p className="text-xs text-[#5a5a70]">Remote</p>
                </div>
                <Circle
                  className={`w-2 h-2 ${
                    device.is_online ? 'text-[#39ff14] fill-[#39ff14]' : 'text-[#5a5a70] fill-[#5a5a70]'
                  }`}
                />
              </button>
            ))
          ) : (
            <div className="text-center py-8">
              <Camera className="w-10 h-10 text-[#5a5a70] mx-auto mb-2" />
              <p className="text-sm text-[#8888a0]">No remote devices</p>
            </div>
          )}
        </div>

        {waitingSession && !isHostStreaming && (
          <div className="mb-6 p-4 bg-[#39ff14]/10 border border-[#39ff14]/30 rounded-xl animate-pulse">
            <div className="flex items-center gap-2 mb-3">
              <Video className="w-5 h-5 text-[#39ff14]" />
              <h3 className="text-sm font-semibold text-white">Camera Request</h3>
            </div>
            <p className="text-xs text-[#8888a0] mb-3">
              {getViewerDeviceName()} wants to view your camera
            </p>
            <Button
              onClick={startHostCamera}
              className="w-full bg-[#39ff14] text-[#0a0a0f] hover:bg-[#39ff14]/80"
            >
              <Video className="w-4 h-4 mr-2" />
              Start Camera
            </Button>
          </div>
        )}

        {isHostStreaming && (
          <div className="mb-6 p-4 bg-[#ff6b35]/10 border border-[#ff6b35]/30 rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-[#ff6b35] animate-pulse" />
              <h3 className="text-sm font-semibold text-white">Camera Active</h3>
            </div>
            <p className="text-xs text-[#8888a0] mb-3">
              Your camera is being shared
            </p>
            <div className="flex gap-2 mb-3">
              <Button
                onClick={switchCamera}
                variant="outline"
                size="sm"
                className="flex-1 border-[#2a2a3a] text-white hover:bg-[#1a1a24]"
              >
                <FlipHorizontal className="w-4 h-4 mr-1" />
                Flip
              </Button>
            </div>
            <Button
              onClick={stopHostCamera}
              className="w-full bg-[#ff073a] text-white hover:bg-[#ff073a]/80"
            >
              <VideoOff className="w-4 h-4 mr-2" />
              Stop Camera
            </Button>
          </div>
        )}

        {pendingRequests.length > 0 && (
          <div className="mt-auto">
            <div className="text-xs text-[#ff6b35] uppercase tracking-wider mb-2 px-2">
              Camera Requests ({pendingRequests.length})
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {pendingRequests.map(request => (
                <div key={request.id} className="bg-[#1a1a24] rounded-lg p-3">
                  <p className="text-sm text-white mb-2">Camera access request</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleRequestResponse(request.id, 'approved')}
                      className="flex-1 bg-[#39ff14] text-[#0a0a0f] hover:bg-[#39ff14]/80"
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleRequestResponse(request.id, 'rejected')}
                      className="flex-1 bg-[#ff073a] text-white hover:bg-[#ff073a]/80"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col" ref={containerRef}>
        {isHostStreaming ? (
          <div className="flex-1 relative bg-black">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain"
            />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-black/60 backdrop-blur rounded-full">
              <div className="w-2 h-2 rounded-full bg-[#ff073a] animate-pulse" />
              <span className="text-sm text-white">Camera Active</span>
              <button
                onClick={switchCamera}
                className="p-2 rounded-full hover:bg-white/10 text-white"
              >
                <FlipHorizontal className="w-4 h-4" />
              </button>
              <button
                onClick={stopHostCamera}
                className="p-2 rounded-full bg-[#ff073a] hover:bg-[#ff073a]/80 text-white"
              >
                <VideoOff className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : !selectedDevice ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-[#1a1a24] flex items-center justify-center">
                <Camera className="w-10 h-10 text-[#5a5a70]" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Select a Device</h3>
              <p className="text-[#8888a0] mb-4">Choose a device to view its camera</p>
              
              {waitingSession && !isHostStreaming && (
                <div className="mt-8 p-4 bg-[#39ff14]/10 border border-[#39ff14]/30 rounded-xl max-w-sm mx-auto animate-pulse">
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <Video className="w-5 h-5 text-[#39ff14]" />
                    <span className="text-sm font-semibold text-white">Camera Request</span>
                  </div>
                  <p className="text-xs text-[#8888a0] mb-3">
                    {getViewerDeviceName()} wants to view your camera
                  </p>
                  <Button
                    onClick={startHostCamera}
                    className="w-full bg-[#39ff14] text-[#0a0a0f] hover:bg-[#39ff14]/80"
                  >
                    <Video className="w-4 h-4 mr-2" />
                    Start Camera
                  </Button>
                </div>
              )}
            </div>
          </div>
        ) : accessStatus === 'none' ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-[#b829dd]/20 flex items-center justify-center">
                <Lock className="w-10 h-10 text-[#b829dd]" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Access Required</h3>
              <p className="text-[#8888a0] mb-6">
                You need permission to view the camera of {selectedDevice.device_name}
              </p>
              <Button
                onClick={sendAccessRequest}
                disabled={loading}
                className="bg-gradient-to-r from-[#b829dd] to-[#9920bb] text-white hover:from-[#a020c0] hover:to-[#8818a8]"
              >
                {loading ? 'Sending...' : 'Request Camera Access'}
              </Button>
            </div>
          </div>
        ) : accessStatus === 'pending' ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-[#ff6b35]/20 flex items-center justify-center">
                <RefreshCw className="w-10 h-10 text-[#ff6b35] animate-spin" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Request Pending</h3>
              <p className="text-[#8888a0]">
                Waiting for {selectedDevice.device_name} to approve camera access
              </p>
            </div>
          </div>
        ) : accessStatus === 'rejected' ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-[#ff073a]/20 flex items-center justify-center">
                <X className="w-10 h-10 text-[#ff073a]" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Access Denied</h3>
              <p className="text-[#8888a0] mb-6">
                Camera access was rejected by {selectedDevice.device_name}
              </p>
              <Button
                onClick={() => setAccessStatus('none')}
                variant="outline"
                className="border-[#2a2a3a] text-white hover:bg-[#1a1a24]"
              >
                Request Again
              </Button>
            </div>
          </div>
        ) : !isStreaming ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-[#b829dd]/20 flex items-center justify-center">
                <Camera className="w-10 h-10 text-[#b829dd]" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Ready to View</h3>
              <p className="text-[#8888a0] mb-6">
                View {selectedDevice.device_name}&apos;s camera
              </p>
              <Button
                onClick={requestViewCamera}
                disabled={loading}
                className="bg-gradient-to-r from-[#b829dd] to-[#9920bb] text-white hover:from-[#a020c0] hover:to-[#8818a8]"
              >
                <Video className="w-4 h-4 mr-2" />
                Request Camera View
              </Button>
              <p className="text-xs text-[#5a5a70] mt-4">
                The host will need to start their camera
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 relative bg-black flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-[#b829dd]/20 flex items-center justify-center">
                <RefreshCw className="w-10 h-10 text-[#b829dd] animate-spin" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Waiting for Camera</h3>
              <p className="text-[#8888a0] mb-4">
                Waiting for {selectedDevice.device_name} to start their camera
              </p>
              <Button
                onClick={stopViewing}
                variant="outline"
                className="border-[#2a2a3a] text-white hover:bg-[#1a1a24]"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
