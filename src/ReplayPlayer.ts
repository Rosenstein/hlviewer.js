import { glMatrix } from 'gl-matrix'
import { createNanoEvents, type Emitter as EventEmitter } from 'nanoevents'
import type { Game } from './Game'
import { Replay } from './Replay/Replay'
import { ReplayState } from './Replay/ReplayState'

const updateGame = (game: Game, state: ReplayState) => {
  game.camera.position[0] = state.cameraPos[0]
  game.camera.position[1] = state.cameraPos[1]
  game.camera.position[2] = state.cameraPos[2]
  game.camera.rotation[0] = glMatrix.toRadian(state.cameraRot[0])
  game.camera.rotation[1] = glMatrix.toRadian(state.cameraRot[1])
  game.camera.rotation[2] = glMatrix.toRadian(state.cameraRot[2])
}

export class ReplayPlayer {
  game: Game
  state: ReplayState
  replay: any
  events: EventEmitter

  currentMap = 0
  currentChunk = 0
  currentTime = 0
  currentTick = 0
  isPlaying = false
  isPaused = false
  speed = 1

  constructor(game: Game) {
    this.reset()
    this.game = game
    this.state = new ReplayState()
    this.replay = null
    this.events = createNanoEvents()
  }

  reset() {
    this.currentMap = 0
    this.currentChunk = 0
    this.currentTime = 0
    this.currentTick = 0

    this.isPlaying = false
    this.isPaused = false
    this.speed = 1

    if (this.replay) {
      const firstChunk = this.replay.maps[0].chunks[0]
      firstChunk.reader.seek(0)
      this.state = firstChunk.state.clone()
    }
  }

  changeReplay(replay: Replay) {
    this.replay = replay
    this.reset()
  }

  play() {
    if (!this.isPlaying) {
      this.isPlaying = true
    } else if (this.isPaused) {
      this.isPaused = false
    }

    this.events.emit('play', this.currentTime)
  }

  pause() {
    if (this.isPlaying) {
      this.isPaused = true
    }

    this.events.emit('pause', this.currentTime)
  }

  stop() {
    this.reset()
    this.events.emit('stop', 0)
  }

  speedUp() {
    this.speed = Math.min(this.speed * 2, 4)
  }

  speedDown() {
    this.speed = Math.max(this.speed / 2, 0.25)
  }

  seek(value: number) {
    const t = Math.max(0, Math.min(this.replay.length, value))

    const maps = this.replay.maps
    for (let i = 0; i < maps.length; ++i) {
      const chunks = maps[i].chunks
      for (let j = 0; j < chunks.length; ++j) {
        const chunk = chunks[j]
        const startTime = chunk.startTime
        const timeLimit = startTime + chunk.timeLength
        if (t >= startTime && t < timeLimit) {
          this.currentMap = i
          this.currentChunk = j
          this.currentTime = t

          this.state = chunk.state.clone()
          const deltaDecoders = this.replay.deltaDecoders
          const customMessages = this.replay.customMessages
          const r = chunk.reader
          r.seek(0)
          while (true) {
            const offset = r.tell()
            const frame = Replay.readFrame(r, deltaDecoders, customMessages)
            if (frame.time <= t) {
              this.state.feedFrame(frame)
              this.currentTick = frame.tick
            } else {
              r.seek(offset)
              break
            }
          }

          this.events.emit('seek', t)
          updateGame(this.game, this.state)

          return
        }
      }
    }
  }

  seekByPercent(value: number) {
    this.seek((Math.max(0, Math.min(value, 100)) / 100) * this.replay.length)
  }

  update(dt: number) {
    if (!this.isPlaying || this.isPaused) {
      return
    }

    const deltaDecoders = this.replay.deltaDecoders
    const customMessages = this.replay.customMessages

    let map = this.replay.maps[this.currentMap]
    let chunk = map.chunks[this.currentChunk]
    let r = chunk.reader

    const endTime = this.currentTime + dt * this.speed

    let hitStop = false

    while (true) {
      let offset = r.tell()
      if (offset >= chunk.data.length) {
        if (this.currentChunk === map.chunks.length - 1) {
          if (this.currentMap === this.replay.maps.length - 1) {
            hitStop = true
            break
          }
          this.currentChunk = 0
          this.currentMap++
          map = this.replay.maps[this.currentMap]
          chunk = map.chunks[this.currentChunk]
        } else {
          this.currentChunk++
          chunk = map.chunks[this.currentChunk]
        }

        r = chunk.reader
        r.seek(0)
        offset = 0

        continue
      }

      const sounds: any[] = this.game.sounds
      const frame: any = Replay.readFrame(r, deltaDecoders, customMessages)
      if (frame.type < 2) {
        for (let i = 0; i < frame.data.length; ++i) {
          const message = frame.data[i]
          if (message.type === 6) {
            // TODO: Magic number SVC_SOUND
            const msgSound = message.data
            const sound = sounds.find((s: any) => s.index === msgSound.soundIndex)
            if (sound && sound.name !== 'common/null.wav') {
              const channel = msgSound.channel
              const volume = msgSound.volume
              // TODO: Positional audio
              this.game.soundSystem.play(sound, channel, volume)
            }
          } else if (message.type === 29) {
            // TODO: Magic number
            const msgSound = message.data
            const sound = sounds.find((s: any) => s.index === msgSound.soundIndex)
            if (sound && sound.name !== 'common/null.wav') {
              // TODO: Use after implementing positional audio
              // let volume = msgSound.volume
              // this.game.soundSystem.play(sound, 6, volume)
            }
          } else if (message.type === 9) {
            for (const command of message.data.commands) {
              switch (command.func) {
                case 'speak':
                case 'spk':
                case 'play': {
                  const soundName = `${command.params[0]}.wav`
                  const sound = sounds.find((s: any) => s.name === soundName)
                  if (!sound) {
                    return
                  }

                  this.game.soundSystem.play(sound, 1, 0.7)
                  break
                }
                case 'playvol': {
                  const soundName = `${command.params[0]}.wav`
                  let volume: number
                  if (Number.isNaN(command.params[1])) {
                    volume = 1
                  } else {
                    volume = Number.parseFloat(command.params[1])
                  }
                  const sound = sounds.find((s: any) => s.name === soundName)
                  if (!sound) {
                    return
                  }

                  this.game.soundSystem.play(sound, 1, volume)
                  break
                }
              }
            }
          }
        }
      } else if (frame.type === 8) {
        const sample = frame.sound.sample
        const sound = sounds.find((s) => s.name === sample)
        if (sound && sound.name !== 'common/null.wav') {
          const channel = frame.sound.channel
          const volume = frame.sound.volume
          this.game.soundSystem.play(sound, channel, volume)
        }
      }
      if (frame.time <= endTime) {
        this.state.feedFrame(frame)
        this.currentTick = frame.tick
      } else {
        r.seek(offset)
        break
      }
    }

    updateGame(this.game, this.state)

    this.currentTime = endTime

    if (hitStop) {
      this.stop()
    }
  }
}
