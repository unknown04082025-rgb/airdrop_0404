"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Folder, File, FileText, FileImage, FileVideo, FileAudio, FileCode, FileArchive,
  ChevronRight, Search, Download, Upload, Trash2,
  RefreshCw, Grid, List, Home, HardDrive, Laptop, Circle, Lock,
  Check, X, Eye, MoreVertical, FolderPlus, CloudUpload, Clock, HardDriveUpload,
  CheckCircle2, XCircle, Timer, AlertCircle, Pause, Play, Database
} from 'lucide-react'
import { DevicePair, supabase, AccessRequest } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'

interface FileAccessProps {
  devices: DevicePair[]
  currentDevice: DevicePair | null
}

interface FileItem {
  id: string
  name: string
  path: string
  size: number
  type: string
  isDirectory: boolean
  modified: string
  url?: string
}

interface UploadingFile {
  id: string
  name: string
  size: number
  progress: number
  status: 'uploading' | 'completed' | 'failed' | 'paused'
  speed: number
  timeRemaining: number
  uploadedSize: number
  startTime: number
  file: File
  abortController?: AbortController
}

const getFileIcon = (file: FileItem) => {
  if (file.isDirectory) return <Folder className="w-5 h-5 text-[#39ff14]" />
  
  const ext = file.type.toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'image'].includes(ext)) 
    return <FileImage className="w-5 h-5 text-[#b829dd]" />
  if (['mp4', 'avi', 'mkv', 'mov', 'webm', 'video'].includes(ext)) 
    return <FileVideo className="w-5 h-5 text-[#ff6b35]" />
  if (['mp3', 'wav', 'flac', 'aac', 'audio'].includes(ext)) 
    return <FileAudio className="w-5 h-5 text-[#00f0ff]" />
  if (['js', 'ts', 'py', 'java', 'cpp', 'html', 'css', 'json'].includes(ext)) 
    return <FileCode className="w-5 h-5 text-[#ff073a]" />
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) 
    return <FileArchive className="w-5 h-5 text-[#8888a0]" />
  if (['txt', 'doc', 'docx', 'pdf'].includes(ext)) 
    return <FileText className="w-5 h-5 text-[#00f0ff]" />
  
  return <File className="w-5 h-5 text-[#8888a0]" />
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '-'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatSpeed = (bytesPerSecond: number): string => {
  if (bytesPerSecond === 0) return '0 B/s'
  const k = 1024
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k))
  return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatTime = (seconds: number): string => {
  if (seconds === Infinity || isNaN(seconds) || seconds <= 0) return 'Calculating...'
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${minutes}m`
}

const getFileType = (mimeType: string, fileName: string): string => {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  return ext
}

export function FileAccess({ devices, currentDevice }: FileAccessProps) {
  const [selectedDevice, setSelectedDevice] = useState<DevicePair | null>(null)
  const [files, setFiles] = useState<FileItem[]>([])
  const [currentPath, setCurrentPath] = useState('/')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [accessStatus, setAccessStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none')
  const [showAccessRequest, setShowAccessRequest] = useState(false)
  const [pendingRequests, setPendingRequests] = useState<AccessRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([])
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [totalUploadStats, setTotalUploadStats] = useState({
    totalFiles: 0,
    completedFiles: 0,
    failedFiles: 0,
    totalSize: 0,
    uploadedSize: 0,
    overallSpeed: 0,
    overallTimeRemaining: 0,
    overallProgress: 0
  })
  const [storageInfo, setStorageInfo] = useState({
    used: 0,
    total: 5 * 1024 * 1024 * 1024,
    isUnlimited: true
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadQueueRef = useRef<UploadingFile[]>([])
  const isProcessingRef = useRef(false)

  useEffect(() => {
    if (currentDevice) {
      fetchPendingRequests()
    }
  }, [currentDevice])

  useEffect(() => {
    if (selectedDevice && accessStatus === 'approved') {
      fetchFiles()
      fetchStorageInfo()
    }
  }, [selectedDevice, currentPath, accessStatus])

  const fetchStorageInfo = async () => {
    if (!selectedDevice) return
    
    const prefix = selectedDevice.id + '/'
    const { data } = await supabase.storage
      .from('device-files')
      .list(prefix, { limit: 1000 })
    
    if (data) {
      let totalUsed = 0
      const calculateSize = async (items: typeof data, basePath: string) => {
        for (const item of items) {
          if (item.metadata?.size) {
            totalUsed += item.metadata.size
          } else if (!item.id) {
            const { data: subItems } = await supabase.storage
              .from('device-files')
              .list(`${basePath}${item.name}/`, { limit: 1000 })
            if (subItems) {
              await calculateSize(subItems, `${basePath}${item.name}/`)
            }
          }
        }
      }
      await calculateSize(data, prefix)
      setStorageInfo(prev => ({ ...prev, used: totalUsed }))
    }
  }

  useEffect(() => {
    const uploading = uploadingFiles.filter(f => f.status === 'uploading')
    const completed = uploadingFiles.filter(f => f.status === 'completed')
    const failed = uploadingFiles.filter(f => f.status === 'failed')
    const totalSize = uploadingFiles.reduce((acc, f) => acc + f.size, 0)
    const uploadedSize = uploadingFiles.reduce((acc, f) => acc + f.uploadedSize, 0)
    
    const totalSpeed = uploading.reduce((acc, f) => acc + f.speed, 0)
    const remainingSize = totalSize - uploadedSize
    const timeRemaining = totalSpeed > 0 ? remainingSize / totalSpeed : 0
    const overallProgress = totalSize > 0 ? (uploadedSize / totalSize) * 100 : 0

    setTotalUploadStats({
      totalFiles: uploadingFiles.length,
      completedFiles: completed.length,
      failedFiles: failed.length,
      totalSize,
      uploadedSize,
      overallSpeed: totalSpeed,
      overallTimeRemaining: timeRemaining,
      overallProgress
    })
  }, [uploadingFiles])

  const fetchPendingRequests = async () => {
    if (!currentDevice) return
    
    const { data } = await supabase
      .from('access_requests')
      .select('*')
      .eq('target_device_id', currentDevice.id)
      .eq('status', 'pending')
      .eq('request_type', 'file_access')
    
    if (data) setPendingRequests(data)
  }

  const fetchFiles = async () => {
    if (!selectedDevice) return
    setLoading(true)

    const prefix = selectedDevice.id + (currentPath === '/' ? '/' : currentPath + '/')
    
    const { data, error } = await supabase.storage
      .from('device-files')
      .list(prefix.replace(/^\//, ''), {
        limit: 100,
        sortBy: { column: 'name', order: 'asc' }
      })

    if (error) {
      console.error('Error fetching files:', error)
      setFiles([])
      setLoading(false)
      return
    }

    const fileItems: FileItem[] = (data || [])
      .filter(item => item.name !== '.emptyFolderPlaceholder')
      .map(item => {
        const isFolder = !item.metadata || item.id === null
        const filePath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`
        
        let fileUrl = ''
        if (!isFolder) {
          const { data: urlData } = supabase.storage
            .from('device-files')
            .getPublicUrl(`${selectedDevice.id}${filePath}`)
          fileUrl = urlData.publicUrl
        }

        return {
          id: item.id || item.name,
          name: item.name,
          path: filePath,
          size: item.metadata?.size || 0,
          type: isFolder ? 'folder' : getFileType(item.metadata?.mimetype || '', item.name),
          isDirectory: isFolder,
          modified: item.updated_at ? new Date(item.updated_at).toLocaleDateString() : '-',
          url: fileUrl
        }
      })

    setFiles(fileItems)
    setLoading(false)
  }

  const handleDeviceSelect = async (device: DevicePair) => {
    setSelectedDevice(device)
    setCurrentPath('/')
    setFiles([])
    
    if (device.id === currentDevice?.id) {
      setAccessStatus('approved')
      return
    }

    setLoading(true)

    const { data: existingRequest } = await supabase
      .from('access_requests')
      .select('*')
      .eq('requester_device_id', currentDevice?.id)
      .eq('target_device_id', device.id)
      .eq('request_type', 'file_access')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (existingRequest) {
      setAccessStatus(existingRequest.status as 'pending' | 'approved' | 'rejected')
    } else {
      setAccessStatus('none')
      setShowAccessRequest(true)
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
        request_type: 'file_access',
        status: 'pending'
      }])

    if (!error) {
      setAccessStatus('pending')
      setShowAccessRequest(false)
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

  const uploadSingleFile = async (uploadFile: UploadingFile, filePath: string) => {
    const file = uploadFile.file
    const startTime = Date.now()
    let lastLoaded = 0
    let lastTime = startTime
    const speedSamples: number[] = []

    const updateProgress = (loaded: number) => {
      const now = Date.now()
      const timeDiff = (now - lastTime) / 1000
      
      if (timeDiff >= 0.1) {
        const loadedDiff = loaded - lastLoaded
        const instantSpeed = timeDiff > 0 ? loadedDiff / timeDiff : 0
        
        speedSamples.push(instantSpeed)
        if (speedSamples.length > 10) speedSamples.shift()
        
        const avgSpeed = speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length
        const remaining = file.size - loaded
        const timeRemaining = avgSpeed > 0 ? remaining / avgSpeed : 0
        
        lastLoaded = loaded
        lastTime = now
        
        setUploadingFiles(prev => prev.map(f => 
          f.id === uploadFile.id 
            ? {
                ...f,
                progress: Math.round((loaded / file.size) * 100),
                uploadedSize: loaded,
                speed: avgSpeed,
                timeRemaining
              }
            : f
        ))
      }
    }

    try {
      const xhr = new XMLHttpRequest()
      const abortController = new AbortController()
      
      setUploadingFiles(prev => prev.map(f => 
        f.id === uploadFile.id ? { ...f, abortController } : f
      ))

      return new Promise<boolean>((resolve) => {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            updateProgress(event.loaded)
          }
        }

        xhr.onload = async () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setUploadingFiles(prev => prev.map(f => 
              f.id === uploadFile.id 
                ? { ...f, status: 'completed' as const, progress: 100, uploadedSize: file.size }
                : f
            ))
            resolve(true)
          } else {
            setUploadingFiles(prev => prev.map(f => 
              f.id === uploadFile.id 
                ? { ...f, status: 'failed' as const }
                : f
            ))
            resolve(false)
          }
        }

        xhr.onerror = () => {
          setUploadingFiles(prev => prev.map(f => 
            f.id === uploadFile.id 
              ? { ...f, status: 'failed' as const }
              : f
          ))
          resolve(false)
        }

        xhr.onabort = () => {
          setUploadingFiles(prev => prev.map(f => 
            f.id === uploadFile.id 
              ? { ...f, status: 'paused' as const }
              : f
          ))
          resolve(false)
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        
        xhr.open('POST', `${supabaseUrl}/storage/v1/object/device-files/${filePath}`)
        xhr.setRequestHeader('Authorization', `Bearer ${supabaseKey}`)
        xhr.setRequestHeader('x-upsert', 'true')
        xhr.send(file)

        abortController.signal.addEventListener('abort', () => {
          xhr.abort()
        })
      })
    } catch (err) {
      console.error('Upload error:', err)
      setUploadingFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, status: 'failed' as const }
          : f
      ))
      return false
    }
  }

  const processUploadQueue = async () => {
    if (isProcessingRef.current) return
    isProcessingRef.current = true

    while (uploadQueueRef.current.length > 0) {
      const uploadFile = uploadQueueRef.current.shift()
      if (!uploadFile || !selectedDevice) continue

      const currentUploadFile = uploadingFiles.find(f => f.id === uploadFile.id)
      if (currentUploadFile?.status === 'paused') continue

      const filePath = `${selectedDevice.id}${currentPath === '/' ? '/' : currentPath + '/'}${uploadFile.file.name}`
      await uploadSingleFile(uploadFile, filePath)
    }

    isProcessingRef.current = false
    fetchFiles()
  }

  const uploadFiles = async (filesToUpload: FileList | File[]) => {
    if (!selectedDevice || filesToUpload.length === 0) return
    
    setShowUploadModal(true)
    
    const newUploadingFiles: UploadingFile[] = Array.from(filesToUpload).map((file, index) => ({
      id: `upload-${Date.now()}-${index}`,
      name: file.name,
      size: file.size,
      progress: 0,
      status: 'uploading' as const,
      speed: 0,
      timeRemaining: 0,
      uploadedSize: 0,
      startTime: Date.now(),
      file
    }))
    
    setUploadingFiles(prev => [...prev, ...newUploadingFiles])
    uploadQueueRef.current = [...uploadQueueRef.current, ...newUploadingFiles]
    
    processUploadQueue()
  }

  const cancelUpload = (uploadId: string) => {
    const uploadFile = uploadingFiles.find(f => f.id === uploadId)
    if (uploadFile?.abortController) {
      uploadFile.abortController.abort()
    }
    setUploadingFiles(prev => prev.filter(f => f.id !== uploadId))
    uploadQueueRef.current = uploadQueueRef.current.filter(f => f.id !== uploadId)
  }

  const retryUpload = async (uploadId: string) => {
    const uploadFile = uploadingFiles.find(f => f.id === uploadId)
    if (!uploadFile || !selectedDevice) return

    setUploadingFiles(prev => prev.map(f => 
      f.id === uploadId 
        ? { ...f, status: 'uploading' as const, progress: 0, uploadedSize: 0 }
        : f
    ))

    const filePath = `${selectedDevice.id}${currentPath === '/' ? '/' : currentPath + '/'}${uploadFile.file.name}`
    await uploadSingleFile(uploadFile, filePath)
    fetchFiles()
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(e.target.files)
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files)
    }
  }, [selectedDevice, currentPath])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const createFolder = async () => {
    if (!selectedDevice || !newFolderName.trim()) return
    
    const folderPath = `${selectedDevice.id}${currentPath === '/' ? '/' : currentPath + '/'}${newFolderName}/.emptyFolderPlaceholder`
    
    const { error } = await supabase.storage
      .from('device-files')
      .upload(folderPath, new Blob(['']))

    if (!error) {
      setShowNewFolder(false)
      setNewFolderName('')
      fetchFiles()
    }
  }

  const deleteFile = async (file: FileItem) => {
    if (!selectedDevice) return
    
    const filePath = `${selectedDevice.id}${file.path}`
    
    if (file.isDirectory) {
      const { data: folderContents } = await supabase.storage
        .from('device-files')
        .list(filePath)
      
      if (folderContents && folderContents.length > 0) {
        const filesToDelete = folderContents.map(f => `${filePath}/${f.name}`)
        await supabase.storage.from('device-files').remove(filesToDelete)
      }
    } else {
      await supabase.storage.from('device-files').remove([filePath])
    }
    
    fetchFiles()
    setSelectedFiles([])
  }

  const downloadFile = async (file: FileItem) => {
    if (!file.url || file.isDirectory) return
    
    const link = document.createElement('a')
    link.href = file.url
    link.download = file.name
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const navigateToFolder = (folder: FileItem) => {
    if (folder.isDirectory) {
      setCurrentPath(folder.path)
    }
  }

  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles(prev => 
      prev.includes(fileId) 
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    )
  }

  const clearCompletedUploads = () => {
    setUploadingFiles(prev => prev.filter(f => f.status === 'uploading'))
    if (uploadingFiles.every(f => f.status !== 'uploading')) {
      setShowUploadModal(false)
    }
  }

  const filteredFiles = files.filter(file => 
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const remoteDevices = devices.filter(d => d.id !== currentDevice?.id)
  const isUploading = uploadingFiles.some(f => f.status === 'uploading')

  return (
    <div className="h-full flex">
      <div className="w-72 glass-panel border-r border-[#2a2a3a] p-4 flex flex-col overflow-hidden">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-[#39ff14]" />
          Select Device
        </h2>

        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
          <div className="space-y-2 mb-6">
            {currentDevice && (
              <button
                onClick={() => handleDeviceSelect(currentDevice)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  selectedDevice?.id === currentDevice.id
                    ? 'bg-[#39ff14]/20 border border-[#39ff14]/50'
                    : 'bg-[#1a1a24] hover:bg-[#1a1a24]/80'
                }`}
              >
                <Laptop className="w-5 h-5 text-[#39ff14]" />
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-white">{currentDevice.device_name}</p>
                  <p className="text-xs text-[#5a5a70]">This Device</p>
                </div>
                <Circle className="w-2 h-2 text-[#39ff14] fill-[#39ff14]" />
              </button>
            )}

            {remoteDevices.length > 0 && (
              <>
                <div className="text-xs text-[#5a5a70] uppercase tracking-wider mt-4 mb-2 px-2">
                  Remote Devices
                </div>
                {remoteDevices.map(device => (
                  <button
                    key={device.id}
                    onClick={() => handleDeviceSelect(device)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                      selectedDevice?.id === device.id
                        ? 'bg-[#00f0ff]/20 border border-[#00f0ff]/50'
                        : 'bg-[#1a1a24] hover:bg-[#1a1a24]/80'
                    }`}
                  >
                    <Laptop className="w-5 h-5 text-[#00f0ff]" />
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
              </>
            )}
          </div>

          {pendingRequests.length > 0 && (
            <div className="mb-6">
              <div className="text-xs text-[#ff6b35] uppercase tracking-wider mb-2 px-2">
                Access Requests ({pendingRequests.length})
              </div>
              <div className="space-y-2">
                {pendingRequests.map(request => (
                  <div key={request.id} className="bg-[#1a1a24] rounded-lg p-3">
                    <p className="text-sm text-white mb-2">File access request</p>
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

        {selectedDevice && accessStatus === 'approved' && (
          <div className="mt-auto pt-4 border-t border-[#2a2a3a]">
            <div className="bg-[#1a1a24] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Database className="w-4 h-4 text-[#00f0ff]" />
                <span className="text-sm font-medium text-white">Storage</span>
              </div>
              <div className="mb-2">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[#8888a0]">{formatFileSize(storageInfo.used)} used</span>
                  <span className="text-[#5a5a70] flex items-center gap-1">
                    {storageInfo.isUnlimited ? (
                      <>
                        <Infinity className="w-3 h-3" />
                        Unlimited
                      </>
                    ) : (
                      formatFileSize(storageInfo.total)
                    )}
                  </span>
                </div>
                <div className="h-2 bg-[#2a2a3a] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-[#00f0ff] to-[#b829dd] rounded-full transition-all duration-500"
                    style={{ 
                      width: storageInfo.isUnlimited 
                        ? `${Math.min((storageInfo.used / (1024 * 1024 * 1024)) * 10, 100)}%` 
                        : `${(storageInfo.used / storageInfo.total) * 100}%` 
                    }}
                  />
                </div>
              </div>
              <p className="text-[10px] text-[#5a5a70]">
                {storageInfo.isUnlimited 
                  ? 'No storage limit - upload freely!' 
                  : `${formatFileSize(storageInfo.total - storageInfo.used)} available`}
              </p>
            </div>
          </div>
        )}
      </div>

      <div 
        className="flex-1 flex flex-col relative"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {!selectedDevice ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-[#1a1a24] flex items-center justify-center">
                <Folder className="w-10 h-10 text-[#5a5a70]" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Select a Device</h3>
              <p className="text-[#8888a0]">Choose a device from the sidebar to browse files</p>
            </div>
          </div>
        ) : accessStatus === 'none' || showAccessRequest ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-[#ff6b35]/20 flex items-center justify-center">
                <Lock className="w-10 h-10 text-[#ff6b35]" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Access Required</h3>
              <p className="text-[#8888a0] mb-6">
                You need permission to access files on {selectedDevice.device_name}
              </p>
              <Button
                onClick={sendAccessRequest}
                disabled={loading}
                className="bg-gradient-to-r from-[#00f0ff] to-[#00d4ff] text-[#0a0a0f] hover:from-[#00d4ff] hover:to-[#00b8e6]"
              >
                {loading ? 'Sending...' : 'Request Access'}
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
                Waiting for {selectedDevice.device_name} to approve your request
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
                Your request was rejected by {selectedDevice.device_name}
              </p>
              <Button
                onClick={() => {
                  setAccessStatus('none')
                  setShowAccessRequest(true)
                }}
                variant="outline"
                className="border-[#2a2a3a] text-white hover:bg-[#1a1a24]"
              >
                Request Again
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="h-16 border-b border-[#2a2a3a] px-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <button 
                    onClick={() => setCurrentPath('/')}
                    className="text-[#8888a0] hover:text-white transition-colors"
                  >
                    <Home className="w-4 h-4" />
                  </button>
                  {currentPath.split('/').filter(Boolean).map((part, index, arr) => (
                    <div key={index} className="flex items-center gap-2">
                      <ChevronRight className="w-4 h-4 text-[#5a5a70]" />
                      <button
                        onClick={() => setCurrentPath('/' + arr.slice(0, index + 1).join('/'))}
                        className={`${
                          index === arr.length - 1 ? 'text-white' : 'text-[#8888a0] hover:text-white'
                        } transition-colors`}
                      >
                        {part}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-gradient-to-r from-[#39ff14] to-[#20cc10] text-[#0a0a0f] hover:from-[#20cc10] hover:to-[#18aa0c]"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload
                </Button>
                {uploadingFiles.length > 0 && (
                  <Button
                    onClick={() => setShowUploadModal(true)}
                    variant="outline"
                    className="border-[#00f0ff]/50 text-[#00f0ff] hover:bg-[#00f0ff]/10 relative"
                  >
                    <HardDriveUpload className="w-4 h-4 mr-2" />
                    {isUploading ? 'Uploading...' : 'Uploads'}
                    <span className="ml-2 px-1.5 py-0.5 bg-[#00f0ff]/20 rounded text-xs">
                      {totalUploadStats.completedFiles}/{totalUploadStats.totalFiles}
                    </span>
                  </Button>
                )}
                <Button
                  onClick={() => setShowNewFolder(true)}
                  variant="outline"
                  className="border-[#2a2a3a] text-white hover:bg-[#1a1a24]"
                >
                  <FolderPlus className="w-4 h-4 mr-2" /> New Folder
                </Button>
                <Button
                  onClick={fetchFiles}
                  variant="outline"
                  size="icon"
                  className="border-[#2a2a3a] text-white hover:bg-[#1a1a24]"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5a5a70]" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search files..."
                    className="w-48 pl-10 bg-[#1a1a24] border-[#2a2a3a] text-white placeholder:text-[#5a5a70]"
                  />
                </div>
                <div className="flex items-center gap-1 p-1 bg-[#1a1a24] rounded-lg">
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-2 rounded-md transition-colors ${
                      viewMode === 'list' ? 'bg-[#2a2a3a] text-white' : 'text-[#5a5a70]'
                    }`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2 rounded-md transition-colors ${
                      viewMode === 'grid' ? 'bg-[#2a2a3a] text-white' : 'text-[#5a5a70]'
                    }`}
                  >
                    <Grid className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <AnimatePresence>
              {isDragging && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-[#0a0a0f]/90 z-50 flex items-center justify-center"
                >
                  <div className="text-center p-8 border-2 border-dashed border-[#39ff14] rounded-2xl">
                    <CloudUpload className="w-16 h-16 text-[#39ff14] mx-auto mb-4" />
                    <p className="text-xl font-semibold text-white">Drop files here to upload</p>
                    <p className="text-[#8888a0] mt-2">Files will be uploaded to {currentPath}</p>
                    <p className="text-xs text-[#5a5a70] mt-2">Supports files up to 5GB</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex-1 overflow-auto custom-scrollbar p-6 relative">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <RefreshCw className="w-8 h-8 text-[#00f0ff] animate-spin" />
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-[#1a1a24] flex items-center justify-center">
                    <Folder className="w-10 h-10 text-[#5a5a70]" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">No files yet</h3>
                  <p className="text-[#8888a0] mb-6">Upload files or create a folder to get started</p>
                  <div className="flex gap-3">
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-gradient-to-r from-[#39ff14] to-[#20cc10] text-[#0a0a0f]"
                    >
                      <Upload className="w-4 h-4 mr-2" /> Upload Files
                    </Button>
                    <Button
                      onClick={() => setShowNewFolder(true)}
                      variant="outline"
                      className="border-[#2a2a3a] text-white hover:bg-[#1a1a24]"
                    >
                      <FolderPlus className="w-4 h-4 mr-2" /> New Folder
                    </Button>
                  </div>
                </div>
              ) : viewMode === 'list' ? (
                <div className="space-y-1">
                  <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-[#5a5a70] uppercase tracking-wider">
                    <div className="col-span-6">Name</div>
                    <div className="col-span-2">Size</div>
                    <div className="col-span-2">Modified</div>
                    <div className="col-span-2">Actions</div>
                  </div>
                  {filteredFiles.map((file) => (
                    <motion.div
                      key={file.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`grid grid-cols-12 gap-4 px-4 py-3 rounded-lg cursor-pointer transition-all ${
                        selectedFiles.includes(file.id)
                          ? 'bg-[#00f0ff]/10 border border-[#00f0ff]/30'
                          : 'hover:bg-[#1a1a24]'
                      }`}
                      onClick={() => file.isDirectory ? navigateToFolder(file) : toggleFileSelection(file.id)}
                    >
                      <div className="col-span-6 flex items-center gap-3">
                        {getFileIcon(file)}
                        <span className="text-white truncate">{file.name}</span>
                      </div>
                      <div className="col-span-2 text-[#8888a0] text-sm flex items-center">
                        {formatFileSize(file.size)}
                      </div>
                      <div className="col-span-2 text-[#8888a0] text-sm flex items-center">
                        {file.modified}
                      </div>
                      <div className="col-span-2 flex items-center gap-2">
                        {!file.isDirectory && (
                          <>
                            <button 
                              onClick={(e) => { e.stopPropagation(); downloadFile(file); }}
                              className="p-1.5 rounded-md hover:bg-[#2a2a3a] text-[#8888a0] hover:text-white transition-colors"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setPreviewFile(file); }}
                              className="p-1.5 rounded-md hover:bg-[#2a2a3a] text-[#8888a0] hover:text-white transition-colors"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button 
                              onClick={(e) => e.stopPropagation()}
                              className="p-1.5 rounded-md hover:bg-[#2a2a3a] text-[#8888a0] hover:text-white transition-colors"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="bg-[#12121a] border-[#2a2a3a]">
                            {!file.isDirectory && (
                              <DropdownMenuItem 
                                onClick={() => downloadFile(file)}
                                className="text-white hover:bg-[#1a1a24]"
                              >
                                <Download className="w-4 h-4 mr-2" /> Download
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem 
                              onClick={() => deleteFile(file)}
                              className="text-[#ff073a] hover:bg-[#1a1a24]"
                            >
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {filteredFiles.map((file) => (
                    <motion.div
                      key={file.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`p-4 rounded-xl cursor-pointer transition-all ${
                        selectedFiles.includes(file.id)
                          ? 'bg-[#00f0ff]/10 border border-[#00f0ff]/30'
                          : 'bg-[#1a1a24] hover:bg-[#1a1a24]/80'
                      }`}
                      onClick={() => file.isDirectory ? navigateToFolder(file) : toggleFileSelection(file.id)}
                    >
                      <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-[#2a2a3a] flex items-center justify-center">
                        {getFileIcon(file)}
                      </div>
                      <p className="text-sm text-white text-center truncate">{file.name}</p>
                      <p className="text-xs text-[#5a5a70] text-center mt-1">
                        {file.isDirectory ? 'Folder' : formatFileSize(file.size)}
                      </p>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {selectedFiles.length > 0 && (
              <div className="h-16 border-t border-[#2a2a3a] px-6 flex items-center justify-between bg-[#0f0f16]">
                <span className="text-sm text-[#8888a0]">
                  {selectedFiles.length} file(s) selected
                </span>
                <div className="flex items-center gap-2">
                  <Button 
                    onClick={() => {
                      const selectedFile = files.find(f => f.id === selectedFiles[0])
                      if (selectedFile) downloadFile(selectedFile)
                    }}
                    variant="outline" 
                    className="border-[#2a2a3a] text-white hover:bg-[#1a1a24]"
                  >
                    <Download className="w-4 h-4 mr-2" /> Download
                  </Button>
                  <Button 
                    onClick={() => {
                      selectedFiles.forEach(id => {
                        const file = files.find(f => f.id === id)
                        if (file) deleteFile(file)
                      })
                    }}
                    variant="outline" 
                    className="border-[#ff073a]/50 text-[#ff073a] hover:bg-[#ff073a]/10"
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
        <DialogContent className="bg-[#12121a] border-[#2a2a3a] max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <HardDriveUpload className="w-5 h-5 text-[#39ff14]" />
              Upload Progress
            </DialogTitle>
          </DialogHeader>
          
          <div className="glass-panel rounded-xl p-4 mb-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="bg-[#1a1a24] rounded-lg p-3">
                <p className="text-2xl font-bold text-white">{totalUploadStats.completedFiles}/{totalUploadStats.totalFiles}</p>
                <p className="text-xs text-[#8888a0]">Files Completed</p>
              </div>
              <div className="bg-[#1a1a24] rounded-lg p-3">
                <p className="text-2xl font-bold text-[#39ff14]">{formatFileSize(totalUploadStats.uploadedSize)}</p>
                <p className="text-xs text-[#8888a0]">of {formatFileSize(totalUploadStats.totalSize)}</p>
              </div>
              <div className="bg-[#1a1a24] rounded-lg p-3">
                <p className="text-2xl font-bold text-[#00f0ff]">{formatSpeed(totalUploadStats.overallSpeed)}</p>
                <p className="text-xs text-[#8888a0]">Speed</p>
              </div>
              <div className="bg-[#1a1a24] rounded-lg p-3">
                <p className="text-2xl font-bold text-[#ff6b35]">{formatTime(totalUploadStats.overallTimeRemaining)}</p>
                <p className="text-xs text-[#8888a0]">Remaining</p>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-[#8888a0] mb-1">
                <span>Overall Progress</span>
                <span>{Math.round(totalUploadStats.overallProgress)}%</span>
              </div>
              <Progress 
                value={totalUploadStats.overallProgress} 
                className="h-3 bg-[#1a1a24]"
              />
            </div>
            {totalUploadStats.failedFiles > 0 && (
              <div className="mt-3 flex items-center gap-2 text-[#ff073a] text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>{totalUploadStats.failedFiles} file(s) failed to upload</span>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2">
            {uploadingFiles.map((file) => (
              <motion.div
                key={file.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[#1a1a24] rounded-xl p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      file.status === 'completed' ? 'bg-[#39ff14]/20' :
                      file.status === 'failed' ? 'bg-[#ff073a]/20' :
                      file.status === 'paused' ? 'bg-[#ff6b35]/20' :
                      'bg-[#00f0ff]/20'
                    }`}>
                      {file.status === 'completed' ? (
                        <CheckCircle2 className="w-5 h-5 text-[#39ff14]" />
                      ) : file.status === 'failed' ? (
                        <XCircle className="w-5 h-5 text-[#ff073a]" />
                      ) : file.status === 'paused' ? (
                        <Pause className="w-5 h-5 text-[#ff6b35]" />
                      ) : (
                        <Upload className="w-5 h-5 text-[#00f0ff] animate-pulse" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">{file.name}</p>
                      <p className="text-xs text-[#5a5a70]">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {file.status === 'failed' && (
                      <button
                        onClick={() => retryUpload(file.id)}
                        className="p-1.5 rounded-md bg-[#ff6b35]/20 text-[#ff6b35] hover:bg-[#ff6b35]/30"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}
                    {(file.status === 'uploading' || file.status === 'failed') && (
                      <button
                        onClick={() => cancelUpload(file.id)}
                        className="p-1.5 rounded-md bg-[#ff073a]/20 text-[#ff073a] hover:bg-[#ff073a]/30"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <div className="text-right">
                      <p className={`text-sm font-medium ${
                        file.status === 'completed' ? 'text-[#39ff14]' :
                        file.status === 'failed' ? 'text-[#ff073a]' :
                        file.status === 'paused' ? 'text-[#ff6b35]' :
                        'text-[#00f0ff]'
                      }`}>
                        {file.status === 'completed' ? 'Completed' :
                         file.status === 'failed' ? 'Failed' :
                         file.status === 'paused' ? 'Paused' :
                         `${file.progress}%`}
                      </p>
                    </div>
                  </div>
                </div>

                {file.status === 'uploading' && (
                  <>
                    <Progress value={file.progress} className="h-2 bg-[#2a2a3a] mb-3" />
                    <div className="flex items-center justify-between text-xs text-[#5a5a70]">
                      <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1">
                          <Upload className="w-3 h-3" />
                          {formatFileSize(file.uploadedSize)} / {formatFileSize(file.size)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatSpeed(file.speed)}
                        </span>
                      </div>
                      <span className="flex items-center gap-1">
                        <Timer className="w-3 h-3" />
                        {formatTime(file.timeRemaining)}
                      </span>
                    </div>
                  </>
                )}
              </motion.div>
            ))}
          </div>

          {!isUploading && uploadingFiles.length > 0 && (
            <div className="flex justify-end pt-4 border-t border-[#2a2a3a] mt-4">
              <Button
                onClick={clearCompletedUploads}
                className="bg-gradient-to-r from-[#00f0ff] to-[#00d4ff] text-[#0a0a0f]"
              >
                Clear All
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showNewFolder} onOpenChange={setShowNewFolder}>
        <DialogContent className="bg-[#12121a] border-[#2a2a3a]">
          <DialogHeader>
            <DialogTitle className="text-white">Create New Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="bg-[#1a1a24] border-[#2a2a3a] text-white"
              onKeyDown={(e) => e.key === 'Enter' && createFolder()}
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowNewFolder(false)}
                className="border-[#2a2a3a] text-white hover:bg-[#1a1a24]"
              >
                Cancel
              </Button>
              <Button
                onClick={createFolder}
                className="bg-gradient-to-r from-[#39ff14] to-[#20cc10] text-[#0a0a0f]"
              >
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="bg-[#12121a] border-[#2a2a3a] max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-white">{previewFile?.name}</DialogTitle>
          </DialogHeader>
          <div className="pt-4">
            {previewFile && (
              <div className="flex items-center justify-center min-h-[300px] bg-[#0a0a0f] rounded-lg overflow-hidden">
                {previewFile.type === 'image' || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(previewFile.type) ? (
                  <img src={previewFile.url} alt={previewFile.name} className="max-w-full max-h-[60vh] object-contain" />
                ) : previewFile.type === 'video' || ['mp4', 'webm', 'mov'].includes(previewFile.type) ? (
                  <video src={previewFile.url} controls className="max-w-full max-h-[60vh]" />
                ) : previewFile.type === 'audio' || ['mp3', 'wav', 'flac'].includes(previewFile.type) ? (
                  <audio src={previewFile.url} controls className="w-full" />
                ) : (
                  <div className="text-center p-8">
                    <File className="w-16 h-16 text-[#5a5a70] mx-auto mb-4" />
                    <p className="text-[#8888a0]">Preview not available for this file type</p>
                    <Button
                      onClick={() => downloadFile(previewFile)}
                      className="mt-4 bg-gradient-to-r from-[#00f0ff] to-[#00d4ff] text-[#0a0a0f]"
                    >
                      <Download className="w-4 h-4 mr-2" /> Download File
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
