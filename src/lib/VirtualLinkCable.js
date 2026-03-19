import { supabase } from './supabaseClient';

export class VirtualLinkCable {
  /**
   * @param {string} roomId
   * @param {boolean} isHost
   * @param {() => void} onConnect
   * @param {(data: any) => void} onMessage
   * @param {(msg: string) => void} onLog
   */
  constructor(roomId, isHost, onConnect, onMessage, onLog) {
    this.roomId = roomId;
    this.isHost = isHost;
    this.onConnect = onConnect;
    this.onMessage = onMessage;
    this.onLog = onLog;
    this.dataChannel = null;
    
    this.onLog(`🔌 Initializing as ${this.isHost ? 'Host' : 'Client'} in room: ${roomId}`);

    this.peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    this.signalingChannel = supabase.channel(`room_${this.roomId}`);
    
    this.setupWebRTC();
    this.setupSignaling();
  }

  setupWebRTC() {
    if (this.isHost) {
      this.dataChannel = this.peerConnection.createDataChannel('gba-link');
      this.setupDataChannel(this.dataChannel);
    } else {
      this.peerConnection.ondatachannel = (event) => {
        this.dataChannel = event.channel;
        this.setupDataChannel(this.dataChannel);
      };
    }

    /** @param {RTCPeerConnectionIceEvent} event */
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.signalingChannel.send({
          type: 'broadcast',
          event: 'ice-candidate',
          payload: { candidate: event.candidate }
        });
      }
    };
  }

  /** @param {RTCDataChannel} channel */
  setupDataChannel(channel) {
    channel.onopen = () => {
      this.onLog("🔥 P2P WebRTC Connected Successfully!");
      if (this.onConnect) this.onConnect();
    };
    
    /** @param {MessageEvent} event */
    channel.onmessage = (event) => {
      if (this.onMessage) this.onMessage(event.data);
    };
  }

  setupSignaling() {
    this.signalingChannel
      // 1. Host hears the Client arrive, THEN generates the offer
      .on('broadcast', { event: 'client-joined' }, async () => {
        if (this.isHost) {
          this.onLog("👋 Client joined! Generating Host Offer...");
          const offer = await this.peerConnection.createOffer();
          await this.peerConnection.setLocalDescription(offer);
          this.signalingChannel.send({ type: 'broadcast', event: 'offer', payload: { offer } });
        }
      })
      // 2. Client receives the Offer, creates Answer
      .on('broadcast', { event: 'offer' }, async ({ payload }) => {
        if (!this.isHost && this.peerConnection.signalingState === 'stable') {
          this.onLog("📥 Received Host Offer, creating Answer...");
          try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.offer));
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            this.signalingChannel.send({ type: 'broadcast', event: 'answer', payload: { answer } });
            this.onLog("📤 Sent Answer back to Host.");
          } catch (error) { 
            const e = /** @type {Error} */ (error);
            this.onLog(`❌ Offer Error: ${e.message}`); 
          }
        }
      })
      // 3. Host receives the Answer, finalizes connection
      .on('broadcast', { event: 'answer' }, async ({ payload }) => {
        if (this.isHost && this.peerConnection.signalingState === 'have-local-offer') {
          this.onLog("📥 Received Answer from Client. Finalizing...");
          try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.answer));
          } catch (error) { 
            const e = /** @type {Error} */ (error);
            this.onLog(`❌ Answer Error: ${e.message}`); 
          }
        }
      })
      // 4. Handle routing paths (ICE candidates)
      .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
        try {
          if (this.peerConnection.remoteDescription) {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
          }
        } catch (e) { /* Ignore silent ICE errors */ }
      })
      // 5. Initial Room Join Logic
      .subscribe(async (status) => {
        this.onLog(`📡 Supabase Status: ${status}`);
        if (status === 'SUBSCRIBED') {
          if (this.isHost) {
            this.onLog("⏳ Waiting for Client to join...");
          } else {
            this.onLog("📤 Announcing arrival to Host...");
            // Client tells the Host to start the handshake!
            this.signalingChannel.send({ type: 'broadcast', event: 'client-joined' });
          }
        }
      });
  }

  /** @param {string} data */
  sendData(data) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(data);
    }
  }

  disconnect() {
    if (this.dataChannel) this.dataChannel.close();
    if (this.peerConnection) this.peerConnection.close();
    supabase.removeChannel(this.signalingChannel);
  }
}