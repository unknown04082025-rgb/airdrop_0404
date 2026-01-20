import { supabase } from './supabase'

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate'
  data: RTCSessionDescriptionInit | RTCIceCandidateInit
  from_device_id: string
  to_device_id: string
  session_id: string
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
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
      if (event.streams[0] && this.onRemoteStream) {
        this.onRemoteStream(event.streams[0])
      }
    }

    this.peerConnection.onconnectionstatechange = () => {
      if (this.peerConnection && this.onConnectionStateChange) {
        this.onConnectionStateChange(this.peerConnection.connectionState)
      }
    }

    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState
      if (state === 'failed' || state === 'disconnected') {
        this.onError?.(`ICE connection ${state}`)
      }
    }

    this.setupSignalingChannel()
  }

  private setupSignalingChannel() {
    const channelName = `webrtc-signaling-${this.sessionId}`
    
    this.channel = supabase.channel(channelName)
      .on('broadcast', { event: 'signaling' }, async (payload) => {
        const message = payload.payload as SignalingMessage
        
        if (message.to_device_id !== this.deviceId) return

        try {
          if (message.type === 'offer' && !this.isHost) {
            await this.handleOffer(message.data as RTCSessionDescriptionInit)
          } else if (message.type === 'answer' && this.isHost) {
            await this.handleAnswer(message.data as RTCSessionDescriptionInit)
          } else if (message.type === 'ice-candidate') {
            await this.handleIceCandidate(message.data as RTCIceCandidateInit)
          }
        } catch (error) {
          console.error('Error handling signaling message:', error)
          this.onError?.('Failed to process signaling message')
        }
      })
      .subscribe()
  }

  private async sendSignalingMessage(message: SignalingMessage) {
    if (!this.channel) return
    
    await this.channel.send({
      type: 'broadcast',
      event: 'signaling',
      payload: message
    })
  }

  async startScreenShare(): Promise<boolean> {
    if (!this.peerConnection) {
      await this.initialize()
    }

    try {
      this.localStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          displaySurface: 'monitor'
        } as MediaTrackConstraints,
        audio: false
      })

      this.localStream.getTracks().forEach(track => {
        if (this.peerConnection && this.localStream) {
          this.peerConnection.addTrack(track, this.localStream)
        }

        track.onended = () => {
          this.stopScreenShare()
        }
      })

      const offer = await this.peerConnection!.createOffer()
      await this.peerConnection!.setLocalDescription(offer)

      this.sendSignalingMessage({
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

  async waitForOffer() {
    if (!this.peerConnection) {
      await this.initialize()
    }
  }

  private async handleOffer(offer: RTCSessionDescriptionInit) {
    if (!this.peerConnection) return

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
    const answer = await this.peerConnection.createAnswer()
    await this.peerConnection.setLocalDescription(answer)

    this.sendSignalingMessage({
      type: 'answer',
      data: answer,
      from_device_id: this.deviceId,
      to_device_id: this.remoteDeviceId,
      session_id: this.sessionId
    })
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit) {
    if (!this.peerConnection) return
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit) {
    if (!this.peerConnection) return
    try {
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
