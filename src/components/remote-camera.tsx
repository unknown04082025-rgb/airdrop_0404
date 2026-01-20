"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
import { 
  Camera, Video, VideoOff, RefreshCw, 
  Laptop, Smartphone, Circle, Lock, Check, X,
  FlipHorizontal, Wifi, WifiOff
} from 'lucide-react'
import { DevicePair, supabase, AccessRequest } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface RemoteCameraProps {
  devices: DevicePair[]
  currentDevice: DevicePair | null
}

interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'camera-ready' | 'camera-stopped' | 'request-stream'
  sdp?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
  senderId: string
  targetId?: string
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]
}

export function RemoteCamera({ devices, currentDevice }: RemoteCameraProps) {
  const [selectedDevice, setSelectedDevice] = useState<DevicePair | null>(null)
  const [accessStatus, setAccessStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none')
  const [pendingRequests, setPendingRequests] = useState<AccessRequest[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [isHostStreaming, setIsHostStreaming] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected')
  const [viewerDeviceId, setViewerDeviceId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([])

  const getRoomId = useCallback((deviceId1: string, deviceId2: string) => {
    const ids = [deviceId1, deviceId2].sort()
    return `camera-room-${ids[0]}-${ids[1]}`
  }, [])

  const cleanup = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null
    }
    pendingCandidatesRef.current = []
    setIsConnected(false)
    setConnectionStatus('disconnected')
  }, [])

  const createPeerConnection = useCallback((isHost: boolean) => {
    cleanup()
    
    const pc = new RTCPeerConnection(ICE_SERVERS)
    pcRef.current = pc

    pc.onicecandidate = (event) => {
      if (event.candidate && channelRef.current && currentDevice) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'signaling',
          payload: {
            type: 'ice-candidate',
            candidate: event.candidate.toJSON(),
            senderId: currentDevice.id,
            targetId: isHost ? viewerDeviceId : selectedDevice?.id
          } as SignalingMessage
        })
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log('ICE state:', pc.iceConnectionState)
      setConnectionStatus(pc.iceConnectionState)
      
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setIsConnected(true)
      } else if (pc.iceConnectionState === 'failed') {
        console.error('ICE connection failed')
        pc.restartIce()
      } else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'closed') {
        setIsConnected(false)
      }
    }

    pc.ontrack = (event) => {
      console.log('Received remote track:', event.track.kind)
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0]
        remoteVideoRef.current.play().catch(console.error)
        setIsConnected(true)
      }
    }

    return pc
  }, [cleanup, currentDevice, selectedDevice, viewerDeviceId])

  const handleSignaling = useCallback(async (message: SignalingMessage) => {
    if (!currentDevice) return
    if (message.senderId === currentDevice.id) return
    if (message.targetId && message.targetId !== currentDevice.id) return

    console.log('Received signaling:', message.type, 'from:', message.senderId)

    try {
      if (message.type === 'request-stream') {
        if (isHostStreaming && streamRef.current) {
          setViewerDeviceId(message.senderId)
          
          const pc = createPeerConnection(true)
          
          streamRef.current.getTracks().forEach(track => {
            pc.addTrack(track, streamRef.current!)
          })

          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)

          channelRef.current?.send({
            type: 'broadcast',
            event: 'signaling',
            payload: {
              type: 'offer',
              sdp: offer,
              senderId: currentDevice.id,
              targetId: message.senderId
            } as SignalingMessage
          })
        }
      } else if (message.type === 'offer') {
        const pc = pcRef.current || createPeerConnection(false)
        
        await pc.setRemoteDescription(new RTCSessionDescription(message.sdp!))
        
        for (const candidate of pendingCandidatesRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
        }
        pendingCandidatesRef.current = []

        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        channelRef.current?.send({
          type: 'broadcast',
          event: 'signaling',
          payload: {
            type: 'answer',
            sdp: answer,
            senderId: currentDevice.id,
            targetId: message.senderId
          } as SignalingMessage
        })
      } else if (message.type === 'answer') {
        if (pcRef.current && pcRef.current.signalingState === 'have-local-offer') {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(message.sdp!))
          
          for (const candidate of pendingCandidatesRef.current) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate))
          }
          pendingCandidatesRef.current = []
        }
      } else if (message.type === 'ice-candidate') {
        if (pcRef.current && pcRef.current.remoteDescription) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(message.candidate!))
        } else {
          pendingCandidatesRef.current.push(message.candidate!)
        }
      } else if (message.type === 'camera-ready') {
        if (isStreaming && selectedDevice?.id === message.senderId) {
          createPeerConnection(false)
          
          channelRef.current?.send({
            type: 'broadcast',
            event: 'signaling',
            payload: {
              type: 'request-stream',
              senderId: currentDevice.id,
              targetId: message.senderId
            } as SignalingMessage
          })
        }
      } else if (message.type === 'camera-stopped') {
        if (selectedDevice?.id === message.senderId) {
          cleanup()
          setIsStreaming(false)
        }
      }
    } catch (err) {
      console.error('Signaling error:', err)
    }
  }, [currentDevice, isHostStreaming, isStreaming, selectedDevice, createPeerConnection, cleanup])

  const joinSignalingChannel = useCallback((targetDeviceId: string) => {
    if (!currentDevice) return

    const roomId = getRoomId(currentDevice.id, targetDeviceId)
    
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }

    const channel = supabase.channel(roomId)
    
    channel
      .on('broadcast', { event: 'signaling' }, ({ payload }: { payload: SignalingMessage }) => {
        handleSignaling(payload)
      })
      .subscribe((status) => {
        console.log('Channel status:', status)
      })

    channelRef.current = channel
  }, [currentDevice, getRoomId, handleSignaling])

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

      return () => {
        supabase.removeChannel(requestChannel)
      }
    }
  }, [currentDevice, fetchPendingRequests])

  useEffect(() => {
    return () => {
      cleanup()
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [cleanup])

  const handleDeviceSelect = async (device: DevicePair) => {
    if (device.id === currentDevice?.id) return

    cleanup()
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

  const startHostCamera = async (viewerId?: string) => {
    if (!currentDevice) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      })

      streamRef.current = stream

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
        localVideoRef.current.play().catch(console.error)
      }

      setIsHostStreaming(true)

      if (viewerId) {
        setViewerDeviceId(viewerId)
        joinSignalingChannel(viewerId)
        
        setTimeout(() => {
          channelRef.current?.send({
            type: 'broadcast',
            event: 'signaling',
            payload: {
              type: 'camera-ready',
              senderId: currentDevice.id
            } as SignalingMessage
          })
        }, 500)
      }
    } catch (err) {
      console.error('Failed to start camera:', err)
    }
  }

  const stopHostCamera = async () => {
    if (channelRef.current && currentDevice) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'signaling',
        payload: {
          type: 'camera-stopped',
          senderId: currentDevice.id
        } as SignalingMessage
      })
    }

    cleanup()
    setIsHostStreaming(false)
    setViewerDeviceId(null)
  }

  const switchCamera = async () => {
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(newFacingMode)

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: newFacingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        })

        streamRef.current = stream

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
        }

        if (pcRef.current) {
          const videoTrack = stream.getVideoTracks()[0]
          const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video')
          if (sender && videoTrack) {
            sender.replaceTrack(videoTrack)
          }
        }
      } catch (err) {
        console.error('Failed to switch camera:', err)
      }
    }
  }

  const requestViewCamera = async () => {
    if (!currentDevice || !selectedDevice) return

    setLoading(true)
    setIsStreaming(true)
    
    joinSignalingChannel(selectedDevice.id)
    
    setTimeout(() => {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'signaling',
        payload: {
          type: 'request-stream',
          senderId: currentDevice.id,
          targetId: selectedDevice.id
        } as SignalingMessage
      })
      setLoading(false)
    }, 500)
  }

  const stopViewing = async () => {
    cleanup()
    setIsStreaming(false)
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

        {isHostStreaming && (
          <div className="mb-6 p-4 bg-[#ff6b35]/10 border border-[#ff6b35]/30 rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-[#ff6b35] animate-pulse" />
              <h3 className="text-sm font-semibold text-white">Camera Active</h3>
            </div>
            <p className="text-xs text-[#8888a0] mb-3">
              Your camera is being shared
            </p>
            {isConnected && (
              <div className="flex items-center gap-2 mb-3 text-xs text-[#39ff14]">
                <Wifi className="w-3 h-3" />
                <span>Viewer connected</span>
              </div>
            )}
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
              {isConnected ? (
                <Wifi className="w-4 h-4 text-[#39ff14]" />
              ) : (
                <WifiOff className="w-4 h-4 text-[#8888a0]" />
              )}
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
        ) : isStreaming ? (
          <div className="flex-1 relative bg-black">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-contain"
            />
            <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-black/60 backdrop-blur rounded-full">
              {isConnected ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-[#39ff14] animate-pulse" />
                  <span className="text-xs text-white">Live</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3 h-3 text-[#ff6b35] animate-spin" />
                  <span className="text-xs text-white">Connecting... ({connectionStatus})</span>
                </>
              )}
            </div>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-black/60 backdrop-blur rounded-full">
              <span className="text-sm text-white">{selectedDevice?.device_name}</span>
              <button
                onClick={stopViewing}
                className="p-2 rounded-full bg-[#ff073a] hover:bg-[#ff073a]/80 text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {!isConnected && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                <div className="text-center">
                  <RefreshCw className="w-12 h-12 text-[#b829dd] animate-spin mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-white mb-2">Connecting...</h3>
                  <p className="text-sm text-[#8888a0] mb-2">
                    Waiting for {selectedDevice?.device_name} to share camera
                  </p>
                  <p className="text-xs text-[#5a5a70]">
                    Status: {connectionStatus}
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : !selectedDevice ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-[#1a1a24] flex items-center justify-center">
                <Camera className="w-10 h-10 text-[#5a5a70]" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Select a Device</h3>
              <p className="text-[#8888a0] mb-4">Choose a device to view its camera</p>
              
              <div className="mt-8">
                <Button
                  onClick={() => startHostCamera()}
                  className="bg-gradient-to-r from-[#b829dd] to-[#9920bb] text-white hover:from-[#a020c0] hover:to-[#8818a8]"
                >
                  <Video className="w-4 h-4 mr-2" />
                  Share My Camera
                </Button>
                <p className="text-xs text-[#5a5a70] mt-2">
                  Start sharing your camera for others to view
                </p>
              </div>
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
        ) : (
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
                {loading ? 'Connecting...' : 'View Camera'}
              </Button>
              <p className="text-xs text-[#5a5a70] mt-4">
                The host must be sharing their camera
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
