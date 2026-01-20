"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, Lock, User, Mail, Eye, EyeOff, Laptop, AlertCircle, CheckCircle2 } from 'lucide-react'
import { signUp, signIn, registerDevice } from '@/lib/auth'
import { useAuth } from '@/lib/auth-context'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export function AuthForm() {
  const [isLogin, setIsLogin] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [deviceName, setDeviceName] = useState('')

  const router = useRouter()
  const { setUser, setDevice } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    if (isLogin) {
      const { user, error } = await signIn(username, password)
      if (error) {
        setError(error)
        setLoading(false)
        return
      }

      if (user) {
        const { device, error: deviceError } = await registerDevice(user.id, deviceName || 'Unknown Device')
        if (deviceError) {
          setError(deviceError)
          setLoading(false)
          return
        }
        
        setUser(user)
        setDevice(device as any)
        setSuccess('Login successful! Redirecting...')
        setTimeout(() => router.push('/dashboard'), 1500)
      }
    } else {
      if (!email || !username || !password) {
        setError('All fields are required')
        setLoading(false)
        return
      }

      const { user, error } = await signUp(email, username, password)
      if (error) {
        setError(error)
        setLoading(false)
        return
      }

      if (user) {
        const { device, error: deviceError } = await registerDevice(user.id, deviceName || 'Primary Device')
        if (deviceError) {
          setError(deviceError)
          setLoading(false)
          return
        }
        
        setUser(user)
        setDevice(device as any)
        setSuccess('Account created successfully! Redirecting...')
        setTimeout(() => router.push('/dashboard'), 1500)
      }
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center cyber-grid relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#0f0f18] to-[#0a0a0f]" />
      
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#00f0ff]/10 rounded-full blur-[100px] animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#b829dd]/10 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-md px-4"
      >
        <div className="glass-panel rounded-2xl p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <div className="relative mb-4">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#00f0ff] to-[#b829dd] p-[2px] cyber-glow">
                <div className="w-full h-full rounded-2xl bg-[#0a0a0f] flex items-center justify-center">
                  <Shield className="w-10 h-10 text-[#00f0ff]" />
                </div>
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">SecureLink</h1>
            <p className="text-[#8888a0] text-sm mt-1">Remote Access Control System</p>
          </div>

          <div className="flex gap-2 p-1 bg-[#1a1a24] rounded-lg mb-6">
            <button
              type="button"
              onClick={() => { setIsLogin(true); setError(''); setSuccess(''); }}
              className={`flex-1 py-2.5 rounded-md text-sm font-medium transition-all duration-300 ${
                isLogin 
                  ? 'bg-gradient-to-r from-[#00f0ff] to-[#00d4ff] text-[#0a0a0f]' 
                  : 'text-[#8888a0] hover:text-white'
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => { setIsLogin(false); setError(''); setSuccess(''); }}
              className={`flex-1 py-2.5 rounded-md text-sm font-medium transition-all duration-300 ${
                !isLogin 
                  ? 'bg-gradient-to-r from-[#b829dd] to-[#9920bb] text-white' 
                  : 'text-[#8888a0] hover:text-white'
              }`}
            >
              Sign Up
            </button>
          </div>

          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-2 p-3 bg-[#ff073a]/10 border border-[#ff073a]/30 rounded-lg mb-4"
              >
                <AlertCircle className="w-4 h-4 text-[#ff073a]" />
                <span className="text-sm text-[#ff073a]">{error}</span>
              </motion.div>
            )}
            {success && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-2 p-3 bg-[#39ff14]/10 border border-[#39ff14]/30 rounded-lg mb-4"
              >
                <CheckCircle2 className="w-4 h-4 text-[#39ff14]" />
                <span className="text-sm text-[#39ff14]">{success}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} className="space-y-4">
            <AnimatePresence mode="wait">
              {!isLogin && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-[#8888a0] text-sm">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8888a0]" />
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your@email.com"
                        className="pl-10 bg-[#1a1a24] border-[#2a2a3a] text-white placeholder:text-[#5a5a70] focus:border-[#00f0ff] focus:ring-[#00f0ff]/20"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-2">
              <Label htmlFor="username" className="text-[#8888a0] text-sm">Username</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8888a0]" />
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  className="pl-10 bg-[#1a1a24] border-[#2a2a3a] text-white placeholder:text-[#5a5a70] focus:border-[#00f0ff] focus:ring-[#00f0ff]/20"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-[#8888a0] text-sm">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8888a0]" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="pl-10 pr-10 bg-[#1a1a24] border-[#2a2a3a] text-white placeholder:text-[#5a5a70] focus:border-[#00f0ff] focus:ring-[#00f0ff]/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8888a0] hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="deviceName" className="text-[#8888a0] text-sm">Device Name</Label>
              <div className="relative">
                <Laptop className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8888a0]" />
                <Input
                  id="deviceName"
                  type="text"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="My Laptop"
                  className="pl-10 bg-[#1a1a24] border-[#2a2a3a] text-white placeholder:text-[#5a5a70] focus:border-[#00f0ff] focus:ring-[#00f0ff]/20"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className={`w-full py-6 text-base font-semibold transition-all duration-300 ${
                isLogin 
                  ? 'bg-gradient-to-r from-[#00f0ff] to-[#00d4ff] hover:from-[#00d4ff] hover:to-[#00b8e6] text-[#0a0a0f]' 
                  : 'bg-gradient-to-r from-[#b829dd] to-[#9920bb] hover:from-[#a020c0] hover:to-[#8818a8] text-white'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Processing...
                </div>
              ) : (
                isLogin ? 'Secure Login' : 'Create Account'
              )}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-[#2a2a3a]">
            <div className="flex items-center justify-center gap-4 text-xs text-[#5a5a70]">
              <div className="flex items-center gap-1">
                <Shield className="w-3 h-3" />
                <span>256-bit Encryption</span>
              </div>
              <div className="w-1 h-1 rounded-full bg-[#5a5a70]" />
              <div className="flex items-center gap-1">
                <Lock className="w-3 h-3" />
                <span>Secure Connection</span>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-[#5a5a70] text-xs mt-6">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </motion.div>
    </div>
  )
}
