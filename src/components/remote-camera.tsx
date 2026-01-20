"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
import { 
  Camera, Video, VideoOff, RefreshCw, 
  Laptop, Smartphone, Circle, Check, X,
  FlipHorizontal, Wifi, WifiOff, Eye
} from 'lucide-react'
import { DevicePair, supabase } from '@/lib/supabase'
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

interface CameraStream {
  id: string
  device_id: string
  is_streaming: boolean
  started_at: string
  updated_at: string
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
  const [isStreaming, setIsStreaming] = useState(false)
  const [isHostStreaming, setIsHostStreaming] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected')
  const [viewerDeviceId, setViewerDeviceId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const [activeStreams, setActiveStreams] = useState<CameraStream[]>([])
  
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([])

  const fetchActiveStreams = useCallback(async () => {
    const { data } = await supabase
      .from('camera_streams')
      .select('*')
      .eq('is_streaming', true)

    if (data) {
      setActiveStreams(data)
    }
  }, [])

  useEffect(() => {
    fetchActiveStreams()

    const channel = supabase
      .channel('camera-streams-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'camera_streams'
        },
        () => {
          fetchActiveStreams()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchActiveStreams])

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

  useEffect(() => {
    return () => {
      cleanup()
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [cleanup])

  const updateStreamStatus = async (streaming: boolean) => {
    if (!currentDevice) return

    if (streaming) {
      await supabase
        .from('camera_streams')
        .upsert({
          device_id: currentDevice.id,
          is_streaming: true,
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'device_id' })
    } else {
      await supabase
        .from('camera_streams')
        .update({ 
          is_streaming: false,
          updated_at: new Date().toISOString()
        })
        .eq('device_id', currentDevice.id)
    }
  }

  const startHostCamera = async () => {
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
      await updateStreamStatus(true)

      const remoteDevices = devices.filter(d => d.id !== currentDevice.id)
      remoteDevices.forEach(device => {
        joinSignalingChannel(device.id)
      })

      setTimeout(() => {
        remoteDevices.forEach(device => {
          const roomId = getRoomId(currentDevice.id, device.id)
          const channel = supabase.channel(roomId)
          channel.send({
            type: 'broadcast',
            event: 'signaling',
            payload: {
              type: 'camera-ready',
              senderId: currentDevice.id
            } as SignalingMessage
          })
        })
      }, 500)
    } catch (err) {
      console.error('Failed to start camera:', err)
    }
  }

  const stopHostCamera = async () => {
    if (channelRef.current && currentDevice) {
      const remoteDevices = devices.filter(d => d.id !== currentDevice.id)
      remoteDevices.forEach(device => {
        const roomId = getRoomId(currentDevice.id, device.id)
        const channel = supabase.channel(roomId)
        channel.send({
          type: 'broadcast',
          event: 'signaling',
          payload: {
            type: 'camera-stopped',
            senderId: currentDevice.id
          } as SignalingMessage
        })
      })
    }

    await updateStreamStatus(false)
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

  const viewRemoteCamera = async (device: DevicePair) => {
    if (!currentDevice) return

    setSelectedDevice(device)
    setLoading(true)
    setIsStreaming(true)
    
    joinSignalingChannel(device.id)
    
    setTimeout(() => {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'signaling',
        payload: {
          type: 'request-stream',
          senderId: currentDevice.id,
          targetId: device.id
        } as SignalingMessage
      })
      setLoading(false)
    }, 500)
  }

  const stopViewing = async () => {
    cleanup()
    setIsStreaming(false)
    setSelectedDevice(null)
  }

  const remoteDevices = devices.filter(d => d.id !== currentDevice?.id)
  const streamingDevices = remoteDevices.filter(d => 
    activeStreams.some(s => s.device_id === d.id && s.is_streaming)
  )

  return (
    <div className="h-full flex flex-col md:flex-row">
      <div className="hidden md:flex w-72 glass-panel border-r border-[#2a2a3a] p-4 flex-col">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Camera className="w-5 h-5 text-[#b829dd]" />
          Remote Camera
        </h2>

        {streamingDevices.length > 0 && (
          <div className="mb-6">
            <p className="text-xs text-[#39ff14] uppercase tracking-wider px-2 mb-2 flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-[#39ff14] animate-pulse" />
              Live Now ({streamingDevices.length})
            </p>
            <div className="space-y-2">
              {streamingDevices.map(device => (
                <button
                  key={device.id}
                  onClick={() => viewRemoteCamera(device)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all bg-[#39ff14]/10 border border-[#39ff14]/30 hover:bg-[#39ff14]/20 ${
                    selectedDevice?.id === device.id ? 'ring-2 ring-[#39ff14]' : ''
                  }`}
                >
                  {device.device_name.toLowerCase().includes('phone') || device.device_name.toLowerCase().includes('mobile') ? (
                    <Smartphone className="w-5 h-5 text-[#39ff14]" />
                  ) : (
                    <Laptop className="w-5 h-5 text-[#39ff14]" />
                  )}
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-white">{device.device_name}</p>
                    <p className="text-xs text-[#39ff14]">Camera Active</p>
                  </div>
                  <Eye className="w-4 h-4 text-[#39ff14]" />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2 mb-6">
          <p className="text-xs text-[#5a5a70] uppercase tracking-wider px-2 mb-2">All Devices</p>
          {remoteDevices.length > 0 ? (
            remoteDevices.map(device => {
              const isLive = activeStreams.some(s => s.device_id === device.id && s.is_streaming)
              return (
                <button
                  key={device.id}
                  onClick={() => isLive ? viewRemoteCamera(device) : null}
                  disabled={!isLive}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    selectedDevice?.id === device.id
                      ? 'bg-[#b829dd]/20 border border-[#b829dd]/50'
                      : isLive 
                        ? 'bg-[#1a1a24] hover:bg-[#1a1a24]/80 cursor-pointer'
                        : 'bg-[#1a1a24]/50 opacity-60 cursor-not-allowed'
                  }`}
                >
                  {device.device_name.toLowerCase().includes('phone') || device.device_name.toLowerCase().includes('mobile') ? (
                    <Smartphone className="w-5 h-5 text-[#b829dd]" />
                  ) : (
                    <Laptop className="w-5 h-5 text-[#b829dd]" />
                  )}
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-white">{device.device_name}</p>
                    <p className="text-xs text-[#5a5a70]">
                      {isLive ? 'Tap to view' : 'Camera not active'}
                    </p>
                  </div>
                  {isLive ? (
                    <div className="w-2 h-2 rounded-full bg-[#39ff14] animate-pulse" />
                  ) : (
                    <Circle className={`w-2 h-2 ${device.is_online ? 'text-[#ff6b35] fill-[#ff6b35]' : 'text-[#5a5a70] fill-[#5a5a70]'}`} />
                  )}
                </button>
              )
            })
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
              <h3 className="text-sm font-semibold text-white">Your Camera is Live</h3>
            </div>
            <p className="text-xs text-[#8888a0] mb-3">
              Other devices can now view your camera
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
              Stop Sharing
            </Button>
          </div>
        )}

        {!isHostStreaming && (
          <div className="mt-auto">
            <Button
              onClick={startHostCamera}
              className="w-full bg-gradient-to-r from-[#b829dd] to-[#9920bb] text-white hover:from-[#a020c0] hover:to-[#8818a8]"
            >
              <Video className="w-4 h-4 mr-2" />
              Share My Camera
            </Button>
            <p className="text-xs text-[#5a5a70] mt-2 text-center">
              Let other devices view your camera
            </p>
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
            <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-black/60 backdrop-blur rounded-full">
              <div className="w-2 h-2 rounded-full bg-[#ff073a] animate-pulse" />
              <span className="text-xs text-white">Broadcasting</span>
            </div>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-black/60 backdrop-blur rounded-full">
              <span className="text-sm text-white">Your Camera</span>
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
        ) : isStreaming && selectedDevice ? (
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
                  <span className="text-xs text-white">Connecting...</span>
                </>
              )}
            </div>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-black/60 backdrop-blur rounded-full">
              <span className="text-sm text-white">{selectedDevice.device_name}</span>
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
                    Establishing connection with {selectedDevice.device_name}
                  </p>
                  <p className="text-xs text-[#5a5a70]">
                    Status: {connectionStatus}
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center max-w-md">
              {streamingDevices.length > 0 ? (
                <>
                  <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-[#39ff14]/20 flex items-center justify-center">
                    <Eye className="w-10 h-10 text-[#39ff14]" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">
                    {streamingDevices.length} Camera{streamingDevices.length > 1 ? 's' : ''} Live
                  </h3>
                  <p className="text-[#8888a0] mb-6">
                    Click on a device in the sidebar to view their camera
                  </p>
                  <div className="grid gap-2 md:hidden">
                    {streamingDevices.map(device => (
                      <Button
                        key={device.id}
                        onClick={() => viewRemoteCamera(device)}
                        className="bg-[#39ff14]/20 text-[#39ff14] hover:bg-[#39ff14]/30 border border-[#39ff14]/30"
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View {device.device_name}
                      </Button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-[#1a1a24] flex items-center justify-center">
                    <Camera className="w-10 h-10 text-[#5a5a70]" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">No Active Cameras</h3>
                  <p className="text-[#8888a0] mb-6">
                    No devices are currently sharing their camera
                  </p>
                </>
              )}
              
              <div className="mt-8 pt-8 border-t border-[#2a2a3a]">
                <Button
                  onClick={startHostCamera}
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
        )}
      </div>
    </div>
  )
}
