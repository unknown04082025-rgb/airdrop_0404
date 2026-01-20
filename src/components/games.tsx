"use client"

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Gamepad2, Users, Trophy, Circle, X, Play, 
  RefreshCw, Laptop, Smartphone, ArrowLeft,
  Hand, Scissors, Square, Crown, Swords
} from 'lucide-react'
import { DevicePair, supabase, GameSession } from '@/lib/supabase'
import { Button } from '@/components/ui/button'

interface GamesProps {
  devices: DevicePair[]
  currentDevice: DevicePair | null
}

type GameType = 'tictactoe' | 'rps'
type TicTacToeBoard = (string | null)[]
type RPSChoice = 'rock' | 'paper' | 'scissors' | null

interface GameState {
  board?: TicTacToeBoard
  player1Choice?: RPSChoice
  player2Choice?: RPSChoice
  round?: number
  player1Score?: number
  player2Score?: number
}

export function Games({ devices, currentDevice }: GamesProps) {
  const [selectedGame, setSelectedGame] = useState<GameType | null>(null)
  const [activeGame, setActiveGame] = useState<GameSession | null>(null)
  const [waitingGames, setWaitingGames] = useState<GameSession[]>([])
  const [loading, setLoading] = useState(false)

  const fetchWaitingGames = useCallback(async () => {
    if (!currentDevice) return

    const { data } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('status', 'waiting')
      .neq('player1_device_id', currentDevice.id)
      .order('created_at', { ascending: false })

    if (data) {
      setWaitingGames(data)
    }
  }, [currentDevice])

  const checkActiveGame = useCallback(async () => {
    if (!currentDevice) return

    const { data } = await supabase
      .from('game_sessions')
      .select('*')
      .or(`player1_device_id.eq.${currentDevice.id},player2_device_id.eq.${currentDevice.id}`)
      .in('status', ['waiting', 'playing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (data) {
      setActiveGame(data)
      setSelectedGame(data.game_type as GameType)
    }
  }, [currentDevice])

  useEffect(() => {
    fetchWaitingGames()
    checkActiveGame()
  }, [fetchWaitingGames, checkActiveGame])

  useEffect(() => {
    if (!currentDevice) return

    const channel = supabase
      .channel(`games-${currentDevice.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_sessions'
        },
        () => {
          fetchWaitingGames()
          if (activeGame) {
            refreshGame()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentDevice, fetchWaitingGames, activeGame])

  const refreshGame = async () => {
    if (!activeGame) return

    const { data } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('id', activeGame.id)
      .single()

    if (data) {
      setActiveGame(data)
    }
  }

  const createGame = async (gameType: GameType) => {
    if (!currentDevice) return
    setLoading(true)

    const initialState: GameState = gameType === 'tictactoe' 
      ? { board: Array(9).fill(null) }
      : { player1Choice: null, player2Choice: null, round: 1, player1Score: 0, player2Score: 0 }

    const { data, error } = await supabase
      .from('game_sessions')
      .insert([{
        game_type: gameType,
        player1_device_id: currentDevice.id,
        status: 'waiting',
        current_turn: currentDevice.id,
        game_state: initialState
      }])
      .select()
      .single()

    if (data && !error) {
      setActiveGame(data)
      setSelectedGame(gameType)
    }
    setLoading(false)
  }

  const joinGame = async (game: GameSession) => {
    if (!currentDevice) return
    setLoading(true)

    const { data, error } = await supabase
      .from('game_sessions')
      .update({
        player2_device_id: currentDevice.id,
        status: 'playing',
        updated_at: new Date().toISOString()
      })
      .eq('id', game.id)
      .select()
      .single()

    if (data && !error) {
      setActiveGame(data)
      setSelectedGame(data.game_type as GameType)
    }
    setLoading(false)
  }

  const leaveGame = async () => {
    if (!activeGame) return

    await supabase
      .from('game_sessions')
      .update({ status: 'finished' })
      .eq('id', activeGame.id)

    setActiveGame(null)
    setSelectedGame(null)
  }

  const getDeviceName = (deviceId: string) => {
    if (deviceId === currentDevice?.id) return 'You'
    const device = devices.find(d => d.id === deviceId)
    return device?.device_name || 'Unknown'
  }

  const remoteDevices = devices.filter(d => d.id !== currentDevice?.id)

  if (activeGame && selectedGame) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-4 border-b border-[#2a2a3a] flex items-center gap-4">
          <button
            onClick={leaveGame}
            className="p-2 rounded-lg hover:bg-[#1a1a24] text-[#8888a0] hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-white">
              {selectedGame === 'tictactoe' ? 'Tic-Tac-Toe' : 'Rock Paper Scissors'}
            </h2>
            <p className="text-xs text-[#8888a0]">
              {activeGame.status === 'waiting' ? 'Waiting for opponent...' : 'Game in progress'}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {selectedGame === 'tictactoe' ? (
            <TicTacToeGame 
              game={activeGame} 
              currentDevice={currentDevice}
              getDeviceName={getDeviceName}
              onUpdate={refreshGame}
            />
          ) : (
            <RPSGame 
              game={activeGame} 
              currentDevice={currentDevice}
              getDeviceName={getDeviceName}
              onUpdate={refreshGame}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col md:flex-row">
      <div className="hidden md:flex w-72 glass-panel border-r border-[#2a2a3a] p-4 flex-col">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Gamepad2 className="w-5 h-5 text-[#ff6b35]" />
          Games
        </h2>

        <div className="space-y-2 mb-6">
          <p className="text-xs text-[#5a5a70] uppercase tracking-wider px-2 mb-2">Available Games</p>
          
          <button
            onClick={() => createGame('tictactoe')}
            disabled={loading}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[#1a1a24] hover:bg-[#1a1a24]/80 transition-all"
          >
            <div className="w-10 h-10 rounded-lg bg-[#00f0ff]/20 flex items-center justify-center">
              <X className="w-5 h-5 text-[#00f0ff]" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-white">Tic-Tac-Toe</p>
              <p className="text-xs text-[#5a5a70]">Classic 3x3 grid</p>
            </div>
            <Play className="w-4 h-4 text-[#8888a0]" />
          </button>

          <button
            onClick={() => createGame('rps')}
            disabled={loading}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[#1a1a24] hover:bg-[#1a1a24]/80 transition-all"
          >
            <div className="w-10 h-10 rounded-lg bg-[#b829dd]/20 flex items-center justify-center">
              <Hand className="w-5 h-5 text-[#b829dd]" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-white">Rock Paper Scissors</p>
              <p className="text-xs text-[#5a5a70]">Best of 3</p>
            </div>
            <Play className="w-4 h-4 text-[#8888a0]" />
          </button>
        </div>

        {waitingGames.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-[#ff6b35] uppercase tracking-wider px-2 mb-2">Join Games</p>
            <div className="space-y-2">
              {waitingGames.map(game => (
                <button
                  key={game.id}
                  onClick={() => joinGame(game)}
                  disabled={loading}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[#ff6b35]/10 border border-[#ff6b35]/30 hover:bg-[#ff6b35]/20 transition-all"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#ff6b35]/20 flex items-center justify-center">
                    {game.game_type === 'tictactoe' ? (
                      <X className="w-4 h-4 text-[#ff6b35]" />
                    ) : (
                      <Hand className="w-4 h-4 text-[#ff6b35]" />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-white">
                      {game.game_type === 'tictactoe' ? 'Tic-Tac-Toe' : 'RPS'}
                    </p>
                    <p className="text-xs text-[#5a5a70]">
                      vs {getDeviceName(game.player1_device_id)}
                    </p>
                  </div>
                  <Swords className="w-4 h-4 text-[#ff6b35]" />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-auto">
          <Button
            onClick={() => {
              fetchWaitingGames()
              checkActiveGame()
            }}
            variant="outline"
            className="w-full border-[#2a2a3a] text-white hover:bg-[#1a1a24]"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="p-4 md:hidden">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => createGame('tictactoe')}
              disabled={loading}
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[#1a1a24] hover:bg-[#1a1a24]/80 transition-all"
            >
              <div className="w-12 h-12 rounded-xl bg-[#00f0ff]/20 flex items-center justify-center">
                <X className="w-6 h-6 text-[#00f0ff]" />
              </div>
              <p className="text-sm font-medium text-white">Tic-Tac-Toe</p>
            </button>

            <button
              onClick={() => createGame('rps')}
              disabled={loading}
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[#1a1a24] hover:bg-[#1a1a24]/80 transition-all"
            >
              <div className="w-12 h-12 rounded-xl bg-[#b829dd]/20 flex items-center justify-center">
                <Hand className="w-6 h-6 text-[#b829dd]" />
              </div>
              <p className="text-sm font-medium text-white">RPS</p>
            </button>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-[#ff6b35]/20 to-[#b829dd]/20 flex items-center justify-center">
              <Gamepad2 className="w-12 h-12 text-[#ff6b35]" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Play Games</h3>
            <p className="text-[#8888a0] mb-6 max-w-sm">
              Challenge other devices to real-time multiplayer games
            </p>
            
            {remoteDevices.length === 0 ? (
              <p className="text-sm text-[#ff6b35]">
                Connect another device to play games
              </p>
            ) : (
              <p className="text-sm text-[#39ff14]">
                {remoteDevices.length} device{remoteDevices.length > 1 ? 's' : ''} available to play
              </p>
            )}

            {waitingGames.length > 0 && (
              <div className="mt-6 space-y-2">
                <p className="text-xs text-[#ff6b35] uppercase tracking-wider">Available Games</p>
                {waitingGames.map(game => (
                  <button
                    key={game.id}
                    onClick={() => joinGame(game)}
                    disabled={loading}
                    className="w-full max-w-xs mx-auto flex items-center gap-3 px-4 py-3 rounded-xl bg-[#ff6b35]/10 border border-[#ff6b35]/30 hover:bg-[#ff6b35]/20 transition-all"
                  >
                    <div className="w-8 h-8 rounded-lg bg-[#ff6b35]/20 flex items-center justify-center">
                      {game.game_type === 'tictactoe' ? (
                        <X className="w-4 h-4 text-[#ff6b35]" />
                      ) : (
                        <Hand className="w-4 h-4 text-[#ff6b35]" />
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-white">
                        {game.game_type === 'tictactoe' ? 'Tic-Tac-Toe' : 'Rock Paper Scissors'}
                      </p>
                      <p className="text-xs text-[#5a5a70]">
                        vs {getDeviceName(game.player1_device_id)}
                      </p>
                    </div>
                    <Swords className="w-4 h-4 text-[#ff6b35]" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface TicTacToeGameProps {
  game: GameSession
  currentDevice: DevicePair | null
  getDeviceName: (id: string) => string
  onUpdate: () => void
}

function TicTacToeGame({ game, currentDevice, getDeviceName, onUpdate }: TicTacToeGameProps) {
  const [board, setBoard] = useState<TicTacToeBoard>(
    (game.game_state as GameState).board || Array(9).fill(null)
  )

  useEffect(() => {
    const channel = supabase
      .channel(`tictactoe-${game.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_sessions',
          filter: `id=eq.${game.id}`
        },
        (payload) => {
          const newGame = payload.new as GameSession
          const state = newGame.game_state as GameState
          if (state.board) {
            setBoard(state.board)
          }
          onUpdate()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [game.id, onUpdate])

  const isMyTurn = game.current_turn === currentDevice?.id && game.status === 'playing'
  const amPlayer1 = game.player1_device_id === currentDevice?.id
  const mySymbol = amPlayer1 ? 'X' : 'O'

  const checkWinner = (b: TicTacToeBoard): string | null => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ]
    for (const [a, b1, c] of lines) {
      if (b[a] && b[a] === b[b1] && b[a] === b[c]) {
        return b[a]
      }
    }
    return null
  }

  const makeMove = async (index: number) => {
    if (!isMyTurn || board[index] || game.status !== 'playing') return

    const newBoard = [...board]
    newBoard[index] = mySymbol
    setBoard(newBoard)

    const winner = checkWinner(newBoard)
    const isDraw = !winner && newBoard.every(cell => cell !== null)

    const nextTurn = amPlayer1 ? game.player2_device_id : game.player1_device_id

    await supabase
      .from('game_sessions')
      .update({
        game_state: { board: newBoard },
        current_turn: winner || isDraw ? null : nextTurn,
        status: winner || isDraw ? 'finished' : 'playing',
        winner_device_id: winner ? (winner === 'X' ? game.player1_device_id : game.player2_device_id) : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', game.id)

    await supabase
      .from('game_moves')
      .insert([{
        game_session_id: game.id,
        player_device_id: currentDevice?.id,
        move_data: { index, symbol: mySymbol }
      }])
  }

  const winner = checkWinner(board)
  const isDraw = !winner && board.every(cell => cell !== null)
  const gameOver = winner || isDraw

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center justify-between w-full max-w-sm mb-6">
        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl ${amPlayer1 ? 'bg-[#00f0ff]/20 border border-[#00f0ff]/50' : 'bg-[#1a1a24]'}`}>
          <X className="w-5 h-5 text-[#00f0ff]" />
          <span className="text-sm text-white">{getDeviceName(game.player1_device_id)}</span>
        </div>
        <span className="text-[#5a5a70]">vs</span>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl ${!amPlayer1 ? 'bg-[#ff6b35]/20 border border-[#ff6b35]/50' : 'bg-[#1a1a24]'}`}>
          <Circle className="w-5 h-5 text-[#ff6b35]" />
          <span className="text-sm text-white">
            {game.player2_device_id ? getDeviceName(game.player2_device_id) : 'Waiting...'}
          </span>
        </div>
      </div>

      {game.status === 'waiting' ? (
        <div className="text-center py-12">
          <RefreshCw className="w-12 h-12 text-[#ff6b35] animate-spin mx-auto mb-4" />
          <p className="text-white text-lg">Waiting for opponent...</p>
          <p className="text-[#8888a0] text-sm mt-2">Share this game with another device</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-6">
            {board.map((cell, index) => (
              <motion.button
                key={index}
                onClick={() => makeMove(index)}
                disabled={!isMyTurn || !!cell || gameOver}
                whileHover={isMyTurn && !cell && !gameOver ? { scale: 1.05 } : {}}
                whileTap={isMyTurn && !cell && !gameOver ? { scale: 0.95 } : {}}
                className={`w-20 h-20 md:w-24 md:h-24 rounded-2xl flex items-center justify-center text-4xl font-bold transition-all ${
                  cell 
                    ? 'bg-[#1a1a24]' 
                    : isMyTurn && !gameOver
                      ? 'bg-[#1a1a24] hover:bg-[#2a2a3a] cursor-pointer'
                      : 'bg-[#1a1a24] cursor-not-allowed'
                }`}
              >
                {cell === 'X' && <X className="w-10 h-10 text-[#00f0ff]" />}
                {cell === 'O' && <Circle className="w-10 h-10 text-[#ff6b35]" />}
              </motion.button>
            ))}
          </div>

          <div className="text-center">
            {gameOver ? (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center"
              >
                {winner ? (
                  <>
                    <Crown className="w-12 h-12 text-[#ffd700] mb-2" />
                    <p className="text-xl font-bold text-white">
                      {(winner === 'X' && amPlayer1) || (winner === 'O' && !amPlayer1) 
                        ? 'You Win!' 
                        : 'You Lose!'}
                    </p>
                  </>
                ) : (
                  <p className="text-xl font-bold text-white">It&apos;s a Draw!</p>
                )}
              </motion.div>
            ) : (
              <p className={`text-lg font-medium ${isMyTurn ? 'text-[#39ff14]' : 'text-[#8888a0]'}`}>
                {isMyTurn ? 'Your turn!' : `Waiting for ${getDeviceName(game.current_turn || '')}...`}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

interface RPSGameProps {
  game: GameSession
  currentDevice: DevicePair | null
  getDeviceName: (id: string) => string
  onUpdate: () => void
}

function RPSGame({ game, currentDevice, getDeviceName, onUpdate }: RPSGameProps) {
  const [gameState, setGameState] = useState<GameState>(game.game_state as GameState)
  const [myChoice, setMyChoice] = useState<RPSChoice>(null)
  const [showResult, setShowResult] = useState(false)

  const amPlayer1 = game.player1_device_id === currentDevice?.id

  useEffect(() => {
    const channel = supabase
      .channel(`rps-${game.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_sessions',
          filter: `id=eq.${game.id}`
        },
        (payload) => {
          const newGame = payload.new as GameSession
          const state = newGame.game_state as GameState
          setGameState(state)
          
          if (state.player1Choice && state.player2Choice) {
            setShowResult(true)
            setTimeout(() => {
              setShowResult(false)
              setMyChoice(null)
            }, 2000)
          }
          onUpdate()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [game.id, onUpdate])

  const makeChoice = async (choice: RPSChoice) => {
    if (!choice || myChoice) return
    setMyChoice(choice)

    const newState = { ...gameState }
    if (amPlayer1) {
      newState.player1Choice = choice
    } else {
      newState.player2Choice = choice
    }

    const bothChose = newState.player1Choice && newState.player2Choice

    if (bothChose) {
      const result = determineWinner(newState.player1Choice!, newState.player2Choice!)
      if (result === 'player1') {
        newState.player1Score = (newState.player1Score || 0) + 1
      } else if (result === 'player2') {
        newState.player2Score = (newState.player2Score || 0) + 1
      }

      const gameOver = (newState.player1Score || 0) >= 2 || (newState.player2Score || 0) >= 2

      await supabase
        .from('game_sessions')
        .update({
          game_state: newState,
          status: gameOver ? 'finished' : 'playing',
          winner_device_id: gameOver 
            ? ((newState.player1Score || 0) >= 2 ? game.player1_device_id : game.player2_device_id)
            : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', game.id)

      setTimeout(async () => {
        if (!gameOver) {
          await supabase
            .from('game_sessions')
            .update({
              game_state: { 
                ...newState, 
                player1Choice: null, 
                player2Choice: null,
                round: (newState.round || 1) + 1
              },
              updated_at: new Date().toISOString()
            })
            .eq('id', game.id)
        }
      }, 2500)
    } else {
      await supabase
        .from('game_sessions')
        .update({
          game_state: newState,
          updated_at: new Date().toISOString()
        })
        .eq('id', game.id)
    }

    await supabase
      .from('game_moves')
      .insert([{
        game_session_id: game.id,
        player_device_id: currentDevice?.id,
        move_data: { choice, round: gameState.round }
      }])
  }

  const determineWinner = (p1: string, p2: string): 'player1' | 'player2' | 'draw' => {
    if (p1 === p2) return 'draw'
    if (
      (p1 === 'rock' && p2 === 'scissors') ||
      (p1 === 'scissors' && p2 === 'paper') ||
      (p1 === 'paper' && p2 === 'rock')
    ) {
      return 'player1'
    }
    return 'player2'
  }

  const ChoiceIcon = ({ choice, size = 'md' }: { choice: RPSChoice, size?: 'sm' | 'md' | 'lg' }) => {
    const sizeClass = size === 'lg' ? 'w-16 h-16' : size === 'md' ? 'w-10 h-10' : 'w-6 h-6'
    if (choice === 'rock') return <Square className={`${sizeClass} text-[#ff6b35]`} />
    if (choice === 'paper') return <Hand className={`${sizeClass} text-[#00f0ff]`} />
    if (choice === 'scissors') return <Scissors className={`${sizeClass} text-[#b829dd]`} />
    return null
  }

  const gameOver = game.status === 'finished'
  const iWon = gameOver && game.winner_device_id === currentDevice?.id

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center justify-between w-full max-w-md mb-6">
        <div className={`flex flex-col items-center gap-2 px-6 py-3 rounded-xl ${amPlayer1 ? 'bg-[#00f0ff]/20 border border-[#00f0ff]/50' : 'bg-[#1a1a24]'}`}>
          <span className="text-sm text-white">{getDeviceName(game.player1_device_id)}</span>
          <span className="text-2xl font-bold text-[#00f0ff]">{gameState.player1Score || 0}</span>
        </div>
        <div className="text-center">
          <p className="text-xs text-[#5a5a70] uppercase">Round</p>
          <p className="text-2xl font-bold text-white">{gameState.round || 1}</p>
        </div>
        <div className={`flex flex-col items-center gap-2 px-6 py-3 rounded-xl ${!amPlayer1 ? 'bg-[#ff6b35]/20 border border-[#ff6b35]/50' : 'bg-[#1a1a24]'}`}>
          <span className="text-sm text-white">
            {game.player2_device_id ? getDeviceName(game.player2_device_id) : 'Waiting...'}
          </span>
          <span className="text-2xl font-bold text-[#ff6b35]">{gameState.player2Score || 0}</span>
        </div>
      </div>

      {game.status === 'waiting' ? (
        <div className="text-center py-12">
          <RefreshCw className="w-12 h-12 text-[#ff6b35] animate-spin mx-auto mb-4" />
          <p className="text-white text-lg">Waiting for opponent...</p>
        </div>
      ) : gameOver ? (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center py-12"
        >
          <Crown className={`w-20 h-20 mx-auto mb-4 ${iWon ? 'text-[#ffd700]' : 'text-[#5a5a70]'}`} />
          <p className="text-2xl font-bold text-white mb-2">
            {iWon ? 'You Win!' : 'You Lose!'}
          </p>
          <p className="text-[#8888a0]">
            Final Score: {gameState.player1Score} - {gameState.player2Score}
          </p>
        </motion.div>
      ) : showResult ? (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex items-center gap-8 py-12"
        >
          <div className="text-center">
            <div className="w-24 h-24 rounded-2xl bg-[#1a1a24] flex items-center justify-center mb-2">
              <ChoiceIcon choice={gameState.player1Choice || null} size="lg" />
            </div>
            <p className="text-sm text-[#8888a0]">{getDeviceName(game.player1_device_id)}</p>
          </div>
          <span className="text-2xl font-bold text-[#5a5a70]">VS</span>
          <div className="text-center">
            <div className="w-24 h-24 rounded-2xl bg-[#1a1a24] flex items-center justify-center mb-2">
              <ChoiceIcon choice={gameState.player2Choice || null} size="lg" />
            </div>
            <p className="text-sm text-[#8888a0]">{getDeviceName(game.player2_device_id || '')}</p>
          </div>
        </motion.div>
      ) : (
        <>
          <div className="text-center mb-6">
            {myChoice ? (
              <div>
                <p className="text-[#8888a0] mb-2">You chose:</p>
                <div className="w-20 h-20 mx-auto rounded-2xl bg-[#1a1a24] flex items-center justify-center">
                  <ChoiceIcon choice={myChoice} size="lg" />
                </div>
                <p className="text-sm text-[#5a5a70] mt-2">Waiting for opponent...</p>
              </div>
            ) : (
              <p className="text-white text-lg mb-4">Make your choice!</p>
            )}
          </div>

          {!myChoice && (
            <div className="flex gap-4">
              {(['rock', 'paper', 'scissors'] as RPSChoice[]).map(choice => (
                <motion.button
                  key={choice}
                  onClick={() => makeChoice(choice)}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-[#1a1a24] hover:bg-[#2a2a3a] flex items-center justify-center transition-all"
                >
                  <ChoiceIcon choice={choice} size="lg" />
                </motion.button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
