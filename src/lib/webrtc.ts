import { supabase } from './supabase'

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'ready'
  data?: RTCSessionDescriptionInit | RTCIceCandidateInit
  from_device_id: string
  to_device_id: string
  session_id: string
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ]
}

export class WebRTCManager {
  private peerConnection: RTCPeerConnection | null = null
  private localStream: MediaStream | null = null
  private channel: ReturnType<typeof supabase.channel> | null = null
  private deviceId: string
  private remoteDeviceId: string
  private sessionId: string
  private isHost: boolean
  private onRemoteStream: ((stream: MediaStream) => void) | null = null
  private onConnectionStateChange: ((state: RTCPeerConnectionState) => void) | null = null
  private onError: ((error: string) => void) | null = null
  private onViewerReady: (() => void) | null = null
  private pendingIceCandidates: RTCIceCandidateInit[] = []
  private isReady = false

  constructor(
    deviceId: string,
    remoteDeviceId: string,
    sessionId: string,
    isHost: boolean
  ) {
    this.deviceId = deviceId
    this.remoteDeviceId = remoteDeviceId
    this.sessionId = sessionId
    this.isHost = isHost
  }

  setOnRemoteStream(callback: (stream: MediaStream) => void) {
    this.onRemoteStream = callback
  }

  setOnConnectionStateChange(callback: (state: RTCPeerConnectionState) => void) {
    this.onConnectionStateChange = callback
  }

  setOnError(callback: (error: string) => void) {
    this.onError = callback
  }

  setOnViewerReady(callback: () => void) {
    this.onViewerReady = callback
  }

  async initialize() {
    this.peerConnection = new RTCPeerConnection(ICE_SERVERS)

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignalingMessage({
          type: 'ice-candidate',
          data: event.candidate.toJSON(),
          from_device_id: this.deviceId,
          to_device_id: this.remoteDeviceId,
          session_id: this.sessionId
        })
      }
    }

    this.peerConnection.ontrack = (event) => {
      console.log('Received remote track:', event.streams)
      if (event.streams[0] && this.onRemoteStream) {
        this.onRemoteStream(event.streams[0])
      }
    }

    this.peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', this.peerConnection?.connectionState)
      if (this.peerConnection && this.onConnectionStateChange) {
        this.onConnectionStateChange(this.peerConnection.connectionState)
      }
    }

    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState
      console.log('ICE connection state:', state)
      if (state === 'failed' || state === 'disconnected') {
        this.onError?.(`ICE connection ${state}`)
      }
    }

    this.peerConnection.onicegatheringstatechange = () => {
      console.log('ICE gathering state:', this.peerConnection?.iceGatheringState)
    }

    await this.setupSignalingChannel()
  }

  private async setupSignalingChannel() {
    const channelName = `webrtc-signaling-${this.sessionId}`
    console.log('Setting up signaling channel:', channelName)
    
    this.channel = supabase.channel(channelName, {
      config: { broadcast: { self: false } }
    })

    this.channel.on('broadcast', { event: 'signaling' }, async (payload) => {
      const message = payload.payload as SignalingMessage
      console.log('Received signaling message:', message.type, 'from:', message.from_device_id, 'to:', message.to_device_id)
      
      if (message.to_device_id !== this.deviceId) {
        console.log('Message not for this device, ignoring')
        return
      }

      try {
        if (message.type === 'ready' && this.isHost) {
          console.log('Viewer is ready, host can start sharing')
          this.onViewerReady?.()
        } else if (message.type === 'offer' && !this.isHost) {
          console.log('Received offer, creating answer')
          await this.handleOffer(message.data as RTCSessionDescriptionInit)
        } else if (message.type === 'answer' && this.isHost) {
          console.log('Received answer')
          await this.handleAnswer(message.data as RTCSessionDescriptionInit)
        } else if (message.type === 'ice-candidate') {
          console.log('Received ICE candidate')
          await this.handleIceCandidate(message.data as RTCIceCandidateInit)
        }
      } catch (error) {
        console.error('Error handling signaling message:', error)
        this.onError?.('Failed to process signaling message')
      }
    })

    await this.channel.subscribe((status) => {
      console.log('Channel subscription status:', status)
    })
  }

  private async sendSignalingMessage(message: SignalingMessage) {
    if (!this.channel) {
      console.error('No channel available for sending message')
      return
    }
    
    console.log('Sending signaling message:', message.type, 'to:', message.to_device_id)
    
    const result = await this.channel.send({
      type: 'broadcast',
      event: 'signaling',
      payload: message
    })
    
    console.log('Send result:', result)
  }

  async signalReady() {
    if (!this.peerConnection) {
      await this.initialize()
    }
    
    this.isReady = true
    console.log('Viewer signaling ready')
    
    await this.sendSignalingMessage({
      type: 'ready',
      from_device_id: this.deviceId,
      to_device_id: this.remoteDeviceId,
      session_id: this.sessionId
    })
  }

  async startScreenShare(): Promise<boolean> {
    if (!this.peerConnection) {
      await this.initialize()
    }

    try {
      console.log('Requesting screen share...')
      this.localStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always'
        },
        audio: false
      })

      console.log('Got local stream:', this.localStream.getTracks())

      this.localStream.getTracks().forEach(track => {
        if (this.peerConnection && this.localStream) {
          console.log('Adding track to peer connection:', track.kind)
          this.peerConnection.addTrack(track, this.localStream)
        }

        track.onended = () => {
          console.log('Screen share track ended')
          this.stopScreenShare()
        }
      })

      console.log('Creating offer...')
      const offer = await this.peerConnection!.createOffer()
      console.log('Setting local description...')
      await this.peerConnection!.setLocalDescription(offer)

      console.log('Sending offer to viewer...')
      await this.sendSignalingMessage({
        type: 'offer',
        data: offer,
        from_device_id: this.deviceId,
        to_device_id: this.remoteDeviceId,
        session_id: this.sessionId
      })

      return true
    } catch (error) {
      console.error('Failed to start screen share:', error)
      this.onError?.('Failed to start screen sharing. Please grant permission.')
      return false
    }
  }

  private async handleOffer(offer: RTCSessionDescriptionInit) {
    if (!this.peerConnection) {
      console.error('No peer connection for handling offer')
      return
    }

    console.log('Setting remote description from offer...')
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
    
    for (const candidate of this.pendingIceCandidates) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (e) {
        console.error('Error adding pending ICE candidate:', e)
      }
    }
    this.pendingIceCandidates = []
    
    console.log('Creating answer...')
    const answer = await this.peerConnection.createAnswer()
    console.log('Setting local description...')
    await this.peerConnection.setLocalDescription(answer)

    console.log('Sending answer to host...')
    await this.sendSignalingMessage({
      type: 'answer',
      data: answer,
      from_device_id: this.deviceId,
      to_device_id: this.remoteDeviceId,
      session_id: this.sessionId
    })
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit) {
    if (!this.peerConnection) {
      console.error('No peer connection for handling answer')
      return
    }
    console.log('Setting remote description from answer...')
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
    
    for (const candidate of this.pendingIceCandidates) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (e) {
        console.error('Error adding pending ICE candidate:', e)
      }
    }
    this.pendingIceCandidates = []
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit) {
    if (!this.peerConnection) {
      console.error('No peer connection for handling ICE candidate')
      return
    }
    
    if (!this.peerConnection.remoteDescription) {
      console.log('Queuing ICE candidate (no remote description yet)')
      this.pendingIceCandidates.push(candidate)
      return
    }
    
    try {
      console.log('Adding ICE candidate...')
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
    } catch (error) {
      console.error('Error adding ICE candidate:', error)
    }
  }

  stopScreenShare() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop())
      this.localStream = null
    }
  }

  cleanup() {
    console.log('Cleaning up WebRTC manager...')
    this.stopScreenShare()
    
    if (this.peerConnection) {
      this.peerConnection.close()
      this.peerConnection = null
    }

    if (this.channel) {
      supabase.removeChannel(this.channel)
      this.channel = null
    }
  }

  getLocalStream(): MediaStream | null {
    return this.localStream
  }
}
