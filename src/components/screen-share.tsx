"use client"

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Monitor, MonitorOff, Play, Pause, Maximize2, Minimize2, 
  Volume2, VolumeX, RefreshCw, Settings, Laptop, Circle,
  Mouse, Keyboard, Lock, Check, X, AlertTriangle, Wifi, WifiOff,
  ZoomIn, ZoomOut, RotateCcw, Camera, HardDrive
} from 'lucide-react'
import { DevicePair, supabase, AccessRequest, ScreenSession } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

interface ScreenShareProps {
  devices: DevicePair[]
  currentDevice: DevicePair | null
}

export function ScreenShare({ devices, currentDevice }: ScreenShareProps) {
  const [selectedDevice, setSelectedDevice] = useState<DevicePair | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isMuted, setIsMuted] = useState(true)
  const [quality, setQuality] = useState(80)
  const [enableControl, setEnableControl] = useState(false)
  const [accessStatus, setAccessStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none')
  const [pendingRequests, setPendingRequests] = useState<AccessRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')
  const [fps, setFps] = useState(0)
  const [latency, setLatency] = useState(0)
  const [zoom, setZoom] = useState(100)
  const [showDeviceSidebar, setShowDeviceSidebar] = useState(false)
  const screenRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (currentDevice) {
      fetchPendingRequests()

      const channel = supabase
        .channel(`screen-requests-for-${currentDevice.id}`)
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
        supabase.removeChannel(channel)
      }
    }
  }, [currentDevice])

  useEffect(() => {
    if (isStreaming) {
      const interval = setInterval(() => {
        setFps(Math.floor(Math.random() * 10 + 25))
        setLatency(Math.floor(Math.random() * 20 + 10))
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [isStreaming])

  useEffect(() => {
    if (!currentDevice || !selectedDevice || accessStatus !== 'pending') return

    const checkRequestStatus = async () => {
      const { data } = await supabase
        .from('access_requests')
        .select('*')
        .eq('requester_device_id', currentDevice.id)
        .eq('target_device_id', selectedDevice.id)
        .eq('request_type', 'screen_share')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (data && data.status !== 'pending') {
        setAccessStatus(data.status as 'approved' | 'rejected')
      }
    }

    const pollInterval = setInterval(checkRequestStatus, 2000)

    const channel = supabase
      .channel(`screen-request-${currentDevice.id}-${selectedDevice.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'access_requests',
          filter: `requester_device_id=eq.${currentDevice.id}`
        },
        (payload) => {
          const updatedRequest = payload.new as AccessRequest
          if (updatedRequest.target_device_id === selectedDevice.id && 
              updatedRequest.request_type === 'screen_share') {
            setAccessStatus(updatedRequest.status as 'approved' | 'rejected')
          }
        }
      )
      .subscribe()

    return () => {
      clearInterval(pollInterval)
      supabase.removeChannel(channel)
    }
  }, [currentDevice, selectedDevice, accessStatus])

  const fetchPendingRequests = async () => {
    if (!currentDevice) return
    
    const { data } = await supabase
      .from('access_requests')
      .select('*')
      .eq('target_device_id', currentDevice.id)
      .eq('status', 'pending')
      .eq('request_type', 'screen_share')
    
    if (data) setPendingRequests(data)
  }

  const handleDeviceSelect = async (device: DevicePair) => {
    if (device.id === currentDevice?.id) {
      return
    }

    setSelectedDevice(device)
    setLoading(true)
    setIsStreaming(false)
    setConnectionStatus('disconnected')

    const { data: existingRequest } = await supabase
      .from('access_requests')
      .select('*')
      .eq('requester_device_id', currentDevice?.id)
      .eq('target_device_id', device.id)
      .eq('request_type', 'screen_share')
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
        request_type: 'screen_share',
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

  const startStreaming = async () => {
    setConnectionStatus('connecting')
    
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    setConnectionStatus('connected')
    setIsStreaming(true)

    if (currentDevice && selectedDevice) {
      await supabase
        .from('screen_sessions')
        .insert([{
          host_device_id: selectedDevice.id,
          viewer_device_id: currentDevice.id,
          status: 'active'
        }])
    }
  }

  const stopStreaming = async () => {
    setIsStreaming(false)
    setConnectionStatus('disconnected')
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      screenRef.current?.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  const remoteDevices = devices.filter(d => d.id !== currentDevice?.id)

  const handleDeviceSelectMobile = (device: DevicePair) => {
    handleDeviceSelect(device)
    setShowDeviceSidebar(false)
  }

  return (
    <div className="h-full flex flex-col md:flex-row">
      <AnimatePresence>
        {showDeviceSidebar && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDeviceSidebar(false)}
              className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="md:hidden fixed left-0 top-0 bottom-0 w-72 glass-panel border-r border-[#2a2a3a] p-4 flex flex-col overflow-hidden z-50"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-[#b829dd]" />
                  Select Device
                </h2>
                <button onClick={() => setShowDeviceSidebar(false)} className="p-2 rounded-lg hover:bg-[#1a1a24] text-[#8888a0]">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                <div className="space-y-2 mb-6">
                  {remoteDevices.length > 0 ? (
                    remoteDevices.map(device => (
                      <button
                        key={device.id}
                        onClick={() => handleDeviceSelectMobile(device)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                          selectedDevice?.id === device.id
                            ? 'bg-[#b829dd]/20 border border-[#b829dd]/50'
                            : 'bg-[#1a1a24] hover:bg-[#1a1a24]/80'
                        }`}
                      >
                        <Laptop className="w-5 h-5 text-[#b829dd]" />
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
                      <MonitorOff className="w-10 h-10 text-[#5a5a70] mx-auto mb-2" />
                      <p className="text-sm text-[#8888a0]">No remote devices available</p>
                    </div>
                  )}
                </div>

                {isStreaming && (
                  <div className="space-y-4 mb-6 p-4 bg-[#1a1a24] rounded-xl">
                    <h3 className="text-sm font-semibold text-white">Stream Settings</h3>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-[#8888a0]">Quality</Label>
                        <span className="text-xs text-white">{quality}%</span>
                      </div>
                      <Slider
                        value={[quality]}
                        onValueChange={([v]) => setQuality(v)}
                        min={20}
                        max={100}
                        step={10}
                        className="[&_[role=slider]]:bg-[#b829dd]"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-[#8888a0]">Remote Control</Label>
                      <Switch
                        checked={enableControl}
                        onCheckedChange={setEnableControl}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-[#8888a0]">Audio</Label>
                      <Switch
                        checked={!isMuted}
                        onCheckedChange={(checked) => setIsMuted(!checked)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="hidden md:flex w-72 glass-panel border-r border-[#2a2a3a] p-4 flex-col">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Monitor className="w-5 h-5 text-[#b829dd]" />
          Screen Share
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
                <Laptop className="w-5 h-5 text-[#b829dd]" />
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
              <MonitorOff className="w-10 h-10 text-[#5a5a70] mx-auto mb-2" />
              <p className="text-sm text-[#8888a0]">No remote devices available</p>
            </div>
          )}
        </div>

        {isStreaming && (
          <div className="space-y-4 mb-6 p-4 bg-[#1a1a24] rounded-xl">
            <h3 className="text-sm font-semibold text-white">Stream Settings</h3>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-[#8888a0]">Quality</Label>
                <span className="text-xs text-white">{quality}%</span>
              </div>
              <Slider
                value={[quality]}
                onValueChange={([v]) => setQuality(v)}
                min={20}
                max={100}
                step={10}
                className="[&_[role=slider]]:bg-[#b829dd]"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs text-[#8888a0]">Remote Control</Label>
              <Switch
                checked={enableControl}
                onCheckedChange={setEnableControl}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs text-[#8888a0]">Audio</Label>
              <Switch
                checked={!isMuted}
                onCheckedChange={(checked) => setIsMuted(!checked)}
              />
            </div>
          </div>
        )}

        {pendingRequests.length > 0 && (
          <div className="mt-auto">
            <div className="text-xs text-[#ff6b35] uppercase tracking-wider mb-2 px-2">
              Screen Requests ({pendingRequests.length})
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {pendingRequests.map(request => (
                <div key={request.id} className="bg-[#1a1a24] rounded-lg p-3">
                  <p className="text-sm text-white mb-2">Screen share request</p>
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

      <div className="flex-1 flex flex-col">
        {!selectedDevice ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-[#1a1a24] flex items-center justify-center">
                <Monitor className="w-10 h-10 text-[#5a5a70]" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Select a Device</h3>
              <p className="text-[#8888a0] mb-4">Choose a remote device to view its screen</p>
              <Button
                onClick={() => setShowDeviceSidebar(true)}
                className="md:hidden bg-gradient-to-r from-[#b829dd] to-[#9920bb] text-white"
              >
                <Monitor className="w-4 h-4 mr-2" />
                Select Device
              </Button>
              <p className="hidden md:block text-[#5a5a70] text-sm">Choose a device from the sidebar</p>
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
                You need permission to view the screen of {selectedDevice.device_name}
              </p>
              <Button
                onClick={sendAccessRequest}
                disabled={loading}
                className="bg-gradient-to-r from-[#b829dd] to-[#9920bb] text-white hover:from-[#a020c0] hover:to-[#8818a8]"
              >
                {loading ? 'Sending...' : 'Request Screen Access'}
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
                Waiting for {selectedDevice.device_name} to approve screen sharing
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
                Screen share request was rejected by {selectedDevice.device_name}
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
          <>
            <div className="min-h-12 md:h-14 border-b border-[#2a2a3a] px-3 md:px-6 py-2 md:py-0 flex flex-col md:flex-row md:items-center justify-between gap-2">
              <div className="flex items-center gap-2 md:gap-4">
                <button
                  onClick={() => setShowDeviceSidebar(true)}
                  className="md:hidden p-2 rounded-lg bg-[#1a1a24] text-[#8888a0]"
                >
                  <Monitor className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    connectionStatus === 'connected' ? 'bg-[#39ff14]' :
                    connectionStatus === 'connecting' ? 'bg-[#ff6b35] animate-pulse' :
                    'bg-[#5a5a70]'
                  }`} />
                  <span className="text-xs md:text-sm text-[#8888a0] capitalize">{connectionStatus}</span>
                </div>
                {isStreaming && (
                  <>
                    <div className="h-4 w-px bg-[#2a2a3a] hidden md:block" />
                    <div className="hidden md:flex items-center gap-4 text-xs text-[#5a5a70]">
                      <span>{fps} FPS</span>
                      <span>{latency}ms</span>
                      <span>{quality}% Quality</span>
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center gap-1 md:gap-2 overflow-x-auto">
                {isStreaming && (
                  <>
                    <div className="flex items-center gap-1 p-1 bg-[#1a1a24] rounded-lg flex-shrink-0">
                      <button
                        onClick={() => setZoom(Math.max(50, zoom - 10))}
                        className="p-1.5 rounded-md hover:bg-[#2a2a3a] text-[#8888a0]"
                      >
                        <ZoomOut className="w-4 h-4" />
                      </button>
                      <span className="text-xs text-white w-10 text-center">{zoom}%</span>
                      <button
                        onClick={() => setZoom(Math.min(200, zoom + 10))}
                        className="p-1.5 rounded-md hover:bg-[#2a2a3a] text-[#8888a0]"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>
                    </div>
                    <button
                      onClick={() => setZoom(100)}
                      className="p-2 rounded-lg hover:bg-[#1a1a24] text-[#8888a0] flex-shrink-0"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setIsMuted(!isMuted)}
                      className="p-2 rounded-lg hover:bg-[#1a1a24] text-[#8888a0] flex-shrink-0"
                    >
                      {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={toggleFullscreen}
                      className="p-2 rounded-lg hover:bg-[#1a1a24] text-[#8888a0] flex-shrink-0"
                    >
                      {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </button>
                    <button className="hidden md:block p-2 rounded-lg hover:bg-[#1a1a24] text-[#8888a0] flex-shrink-0">
                      <Camera className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>

            <div ref={screenRef} className="flex-1 relative bg-[#0a0a0f] overflow-hidden">
              {!isStreaming ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    {connectionStatus === 'connecting' ? (
                      <>
                        <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-[#b829dd]/20 flex items-center justify-center">
                          <RefreshCw className="w-10 h-10 text-[#b829dd] animate-spin" />
                        </div>
                        <h3 className="text-xl font-semibold text-white mb-2">Connecting...</h3>
                        <p className="text-[#8888a0]">Establishing secure connection</p>
                      </>
                    ) : (
                      <>
                        <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-[#b829dd]/20 flex items-center justify-center">
                          <Monitor className="w-10 h-10 text-[#b829dd]" />
                        </div>
                        <h3 className="text-xl font-semibold text-white mb-2">Ready to Stream</h3>
                        <p className="text-[#8888a0] mb-6">
                          View {selectedDevice.device_name}&apos;s screen
                        </p>
                        <Button
                          onClick={startStreaming}
                          className="bg-gradient-to-r from-[#b829dd] to-[#9920bb] text-white hover:from-[#a020c0] hover:to-[#8818a8]"
                        >
                          <Play className="w-4 h-4 mr-2" /> Start Viewing
                        </Button>
                      </>
                    )}
                  </div>
                </div>
            ) : (
              <div 
                className="absolute inset-0 flex items-center justify-center p-2 md:p-4"
                style={{ transform: `scale(${zoom / 100})` }}
              >
                <div className="relative w-full max-w-5xl aspect-video bg-gradient-to-br from-[#1a1a24] to-[#12121a] rounded-lg overflow-hidden border border-[#2a2a3a]">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-full h-full bg-[#12121a] p-2 md:p-4">
                      <div className="h-6 md:h-8 bg-[#1a1a24] rounded-t-lg flex items-center px-2 md:px-4 gap-1 md:gap-2">
                        <div className="w-2 h-2 md:w-3 md:h-3 rounded-full bg-[#ff073a]" />
                        <div className="w-2 h-2 md:w-3 md:h-3 rounded-full bg-[#ff6b35]" />
                        <div className="w-2 h-2 md:w-3 md:h-3 rounded-full bg-[#39ff14]" />
                        <span className="text-[10px] md:text-xs text-[#8888a0] ml-2 md:ml-4 truncate">Desktop - {selectedDevice.device_name}</span>
                      </div>
                      <div className="h-[calc(100%-1.5rem)] md:h-[calc(100%-2rem)] bg-gradient-to-br from-[#0f0f16] to-[#0a0a0f] rounded-b-lg p-3 md:p-6">
                        <div className="grid grid-cols-4 gap-2 md:gap-4">
                          {[...Array(8)].map((_, i) => (
                            <div key={i} className="flex flex-col items-center gap-1 md:gap-2">
                              <div className="w-8 h-8 md:w-12 md:h-12 rounded-lg bg-[#1a1a24] flex items-center justify-center">
                                {i === 0 && <Monitor className="w-4 h-4 md:w-6 md:h-6 text-[#00f0ff]" />}
                                {i === 1 && <Laptop className="w-4 h-4 md:w-6 md:h-6 text-[#39ff14]" />}
                                {i === 2 && <Settings className="w-4 h-4 md:w-6 md:h-6 text-[#8888a0]" />}
                                {i === 3 && <Wifi className="w-4 h-4 md:w-6 md:h-6 text-[#b829dd]" />}
                                {i > 3 && <div className="w-4 h-4 md:w-6 md:h-6 rounded bg-[#2a2a3a]" />}
                              </div>
                              <span className="text-[8px] md:text-[10px] text-[#5a5a70]">
                                {i === 0 ? 'Display' : i === 1 ? 'System' : i === 2 ? 'Settings' : i === 3 ? 'Network' : `App ${i}`}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 md:mt-8 p-2 md:p-4 bg-[#1a1a24] rounded-lg">
                          <div className="flex items-center gap-2 mb-2 md:mb-3">
                            <div className="w-2 h-2 rounded-full bg-[#39ff14] animate-pulse" />
                            <span className="text-[10px] md:text-xs text-[#8888a0]">Live Screen Feed</span>
                          </div>
                          <div className="h-16 md:h-32 bg-[#0a0a0f] rounded border border-[#2a2a3a] flex items-center justify-center">
                            <p className="text-[#5a5a70] text-xs md:text-sm">Remote desktop content</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {enableControl && (
                    <div className="absolute bottom-2 md:bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-[#0a0a0f]/80 backdrop-blur rounded-full border border-[#2a2a3a]">
                      <Mouse className="w-3 h-3 md:w-4 md:h-4 text-[#39ff14]" />
                      <span className="text-[10px] md:text-xs text-[#8888a0]">Control enabled</span>
                      <Keyboard className="w-3 h-3 md:w-4 md:h-4 text-[#39ff14]" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {isStreaming && (
              <div className="absolute bottom-3 right-3 md:bottom-4 md:right-4">
                <Button
                  onClick={stopStreaming}
                  size="sm"
                  className="bg-[#ff073a] text-white hover:bg-[#ff073a]/80"
                >
                  <Pause className="w-4 h-4 md:mr-2" /> 
                  <span className="hidden md:inline">Stop Viewing</span>
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  </div>
)
}
