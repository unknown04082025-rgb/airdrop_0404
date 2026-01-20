"use client"

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Clipboard, Send, Copy, Trash2, Clock, 
  Laptop, Smartphone, Circle, Check,
  Link2, FileText, RefreshCw
} from 'lucide-react'
import { DevicePair, supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'

interface ClipboardSyncProps {
  devices: DevicePair[]
  currentDevice: DevicePair | null
}

interface ClipboardItem {
  id: string
  content: string
  type: 'text' | 'link'
  from_device_id: string
  to_device_id: string | null
  created_at: string
  is_read: boolean
}

export function ClipboardSync({ devices, currentDevice }: ClipboardSyncProps) {
  const [clipboardItems, setClipboardItems] = useState<ClipboardItem[]>([])
  const [newContent, setNewContent] = useState('')
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchClipboardItems = useCallback(async () => {
    if (!currentDevice) return

    const { data } = await supabase
      .from('clipboard_items')
      .select('*')
      .or(`from_device_id.eq.${currentDevice.id},to_device_id.eq.${currentDevice.id},to_device_id.is.null`)
      .order('created_at', { ascending: false })
      .limit(50)

    if (data) {
      setClipboardItems(data)
    }
  }, [currentDevice])

  useEffect(() => {
    fetchClipboardItems()
  }, [fetchClipboardItems])

  useEffect(() => {
    if (!currentDevice) return

    const channel = supabase
      .channel(`clipboard-${currentDevice.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'clipboard_items'
        },
        () => {
          fetchClipboardItems()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentDevice, fetchClipboardItems])

  const detectContentType = (content: string): 'text' | 'link' => {
    const urlPattern = /^(https?:\/\/|www\.)/i
    return urlPattern.test(content.trim()) ? 'link' : 'text'
  }

  const sendClipboardItem = async () => {
    if (!currentDevice || !newContent.trim()) return

    setLoading(true)

    const type = detectContentType(newContent)

    await supabase
      .from('clipboard_items')
      .insert([{
        content: newContent.trim(),
        type,
        from_device_id: currentDevice.id,
        to_device_id: selectedDevice,
        is_read: false
      }])

    setNewContent('')
    setLoading(false)
    fetchClipboardItems()
  }

  const copyToClipboard = async (item: ClipboardItem) => {
    try {
      await navigator.clipboard.writeText(item.content)
      setCopiedId(item.id)
      setTimeout(() => setCopiedId(null), 2000)

      if (!item.is_read && item.to_device_id === currentDevice?.id) {
        await supabase
          .from('clipboard_items')
          .update({ is_read: true })
          .eq('id', item.id)
      }
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const deleteItem = async (id: string) => {
    await supabase
      .from('clipboard_items')
      .delete()
      .eq('id', id)
    
    fetchClipboardItems()
  }

  const getDeviceName = (deviceId: string) => {
    const device = devices.find(d => d.id === deviceId)
    return device?.device_name || 'Unknown Device'
  }

  const remoteDevices = devices.filter(d => d.id !== currentDevice?.id)

  return (
    <div className="h-full flex flex-col md:flex-row">
      <div className="hidden md:flex w-72 glass-panel border-r border-[#2a2a3a] p-4 flex-col">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Clipboard className="w-5 h-5 text-[#ff6b35]" />
          Clipboard Sync
        </h2>

        <div className="mb-6">
          <label className="text-xs text-[#8888a0] mb-2 block">Send to device</label>
          <div className="space-y-2">
            <button
              onClick={() => setSelectedDevice(null)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                selectedDevice === null
                  ? 'bg-[#ff6b35]/20 border border-[#ff6b35]/50'
                  : 'bg-[#1a1a24] hover:bg-[#1a1a24]/80'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-[#ff6b35]/20 flex items-center justify-center">
                <Send className="w-4 h-4 text-[#ff6b35]" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-white">All Devices</p>
                <p className="text-xs text-[#5a5a70]">Broadcast to all</p>
              </div>
            </button>

            {remoteDevices.map(device => (
              <button
                key={device.id}
                onClick={() => setSelectedDevice(device.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  selectedDevice === device.id
                    ? 'bg-[#ff6b35]/20 border border-[#ff6b35]/50'
                    : 'bg-[#1a1a24] hover:bg-[#1a1a24]/80'
                }`}
              >
                {device.device_name.toLowerCase().includes('phone') || device.device_name.toLowerCase().includes('mobile') ? (
                  <Smartphone className="w-5 h-5 text-[#ff6b35]" />
                ) : (
                  <Laptop className="w-5 h-5 text-[#ff6b35]" />
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
            ))}
          </div>
        </div>

        <div className="mt-auto">
          <Button
            onClick={fetchClipboardItems}
            variant="outline"
            className="w-full border-[#2a2a3a] text-white hover:bg-[#1a1a24]"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b border-[#2a2a3a]">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Enter text or URL to share..."
                className="w-full h-24 sm:h-12 px-4 py-3 bg-[#1a1a24] border border-[#2a2a3a] rounded-xl text-white placeholder-[#5a5a70] resize-none focus:outline-none focus:border-[#ff6b35]/50"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={selectedDevice || ''}
                onChange={(e) => setSelectedDevice(e.target.value || null)}
                className="md:hidden px-4 py-2 bg-[#1a1a24] border border-[#2a2a3a] rounded-xl text-white focus:outline-none focus:border-[#ff6b35]/50"
              >
                <option value="">All Devices</option>
                {remoteDevices.map(device => (
                  <option key={device.id} value={device.id}>{device.device_name}</option>
                ))}
              </select>
              <Button
                onClick={sendClipboardItem}
                disabled={!newContent.trim() || loading}
                className="bg-gradient-to-r from-[#ff6b35] to-[#ff4500] text-white hover:from-[#e55a25] hover:to-[#e03d00] px-6"
              >
                <Send className="w-4 h-4 mr-2" />
                Send
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {clipboardItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-20 h-20 rounded-2xl bg-[#1a1a24] flex items-center justify-center mb-4">
                <Clipboard className="w-10 h-10 text-[#5a5a70]" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">No clipboard items</h3>
              <p className="text-[#8888a0]">Send text or links to sync between devices</p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {clipboardItems.map((item) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className={`glass-panel rounded-xl p-4 ${
                      !item.is_read && item.to_device_id === currentDevice?.id
                        ? 'border-[#ff6b35]/50'
                        : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        item.type === 'link' ? 'bg-[#00f0ff]/20' : 'bg-[#ff6b35]/20'
                      }`}>
                        {item.type === 'link' ? (
                          <Link2 className="w-5 h-5 text-[#00f0ff]" />
                        ) : (
                          <FileText className="w-5 h-5 text-[#ff6b35]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-[#8888a0]">
                            From: {item.from_device_id === currentDevice?.id ? 'You' : getDeviceName(item.from_device_id)}
                          </span>
                          {item.to_device_id && (
                            <>
                              <span className="text-xs text-[#5a5a70]">→</span>
                              <span className="text-xs text-[#8888a0]">
                                {item.to_device_id === currentDevice?.id ? 'You' : getDeviceName(item.to_device_id)}
                              </span>
                            </>
                          )}
                          {!item.to_device_id && (
                            <span className="text-xs text-[#ff6b35]">• Broadcast</span>
                          )}
                        </div>
                        <p className="text-white break-all line-clamp-3">
                          {item.type === 'link' ? (
                            <a
                              href={item.content.startsWith('http') ? item.content : `https://${item.content}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#00f0ff] hover:underline"
                              onClick={(e) => {
                                e.preventDefault()
                                window.parent.postMessage({ type: "OPEN_EXTERNAL_URL", data: { url: item.content.startsWith('http') ? item.content : `https://${item.content}` } }, "*")
                              }}
                            >
                              {item.content}
                            </a>
                          ) : (
                            item.content
                          )}
                        </p>
                        <div className="flex items-center gap-1 mt-2 text-xs text-[#5a5a70]">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(item.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => copyToClipboard(item)}
                          className="p-2 rounded-lg hover:bg-[#1a1a24] text-[#8888a0] hover:text-white transition-colors"
                        >
                          {copiedId === item.id ? (
                            <Check className="w-4 h-4 text-[#39ff14]" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                        {item.from_device_id === currentDevice?.id && (
                          <button
                            onClick={() => deleteItem(item.id)}
                            className="p-2 rounded-lg hover:bg-[#1a1a24] text-[#8888a0] hover:text-[#ff073a] transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
