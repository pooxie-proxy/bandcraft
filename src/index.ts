/* eslint-disable import/order */
import './importsWorkaround'
import './styles.css'
import './globals'
import 'iconify-icon'
import './devtools'
import './entities'
import './globalDomListeners'
import initCollisionShapes from './getCollisionShapes'
import { itemsAtlases, onGameLoad } from './inventoryWindows'
import { supportedVersions } from 'minecraft-protocol'

import 'core-js/features/array/at'
import 'core-js/features/promise/with-resolvers'

import './scaleInterface'
import itemsPng from 'prismarine-viewer/public/textures/items.png'
import { initWithRenderer } from './topRightStats'
import PrismarineBlock from 'prismarine-block'

import { options, watchValue } from './optionsStorage'
import './reactUi.jsx'
import { contro, onBotCreate } from './controls'
import './dragndrop'
import { possiblyCleanHandle, resetStateAfterDisconnect } from './browserfs'
import { watchOptionsAfterViewerInit } from './watchOptions'
import downloadAndOpenFile from './downloadAndOpenFile'

import fs from 'fs'
import net from 'net'
import mineflayer from 'mineflayer'
import { WorldDataEmitter, Viewer } from 'prismarine-viewer/viewer'
import pathfinder from 'mineflayer-pathfinder'
import { Vec3 } from 'vec3'

import worldInteractions from './worldInteractions'

import * as THREE from 'three'
import MinecraftData, { versionsByMinecraftVersion } from 'minecraft-data'
import debug from 'debug'
import { defaultsDeep } from 'lodash-es'

import { initVR } from './vr'
import {
  AppConfig,
  activeModalStack,
  activeModalStacks,
  hideModal,
  insertActiveModalStack,
  isGameActive,
  miscUiState,
  showModal
} from './globalState'


import {
  pointerLock,
  toMajorVersion,
  setLoadingScreenStatus
} from './utils'
import { isCypress } from './standaloneUtils'

import {
  removePanorama
} from './panorama'

import { startLocalServer, unsupportedLocalServerFeatures } from './createLocalServer'
import defaultServerOptions from './defaultLocalServerOptions'
import dayCycle from './dayCycle'

import { genTexturePackTextures, watchTexturepackInViewer } from './texturePack'
import { connectToPeer } from './localServerMultiplayer'
import CustomChannelClient from './customClient'
import { loadScript } from 'prismarine-viewer/viewer/lib/utils'
import { registerServiceWorker } from './serviceWorker'
import { appStatusState, lastConnectOptions } from './react/AppStatusProvider'

import { fsState } from './loadSave'
import { watchFov } from './rendererUtils'
import { loadInMemorySave } from './react/SingleplayerProvider'

import { downloadSoundsIfNeeded, earlyCheck as earlySoundsMapCheck } from './soundSystem'
import { ua } from './react/utils'
import { handleMovementStickDelta, joystickPointer } from './react/TouchAreasControls'
import { possiblyHandleStateVariable } from './googledrive'
import flyingSquidEvents from './flyingSquidEvents'
import { hideNotification, notificationProxy, showNotification } from './react/NotificationProvider'
import { saveToBrowserMemory } from './react/PauseScreen'
import { ViewerWrapper } from 'prismarine-viewer/viewer/lib/viewerWrapper'
import './devReload'
import './water'
import { ConnectOptions } from './connect'
import { subscribe } from 'valtio'
import { initWebgpuRenderer } from 'prismarine-viewer/examples/webgpuRendererMain'
import { addNewStat } from 'prismarine-viewer/examples/newStats'
import { getVersion } from 'prismarine-viewer/viewer/lib/version'
// import { ViewerBase } from 'prismarine-viewer/viewer/lib/viewerWrapper'

window.debug = debug
window.THREE = THREE
window.worldInteractions = worldInteractions
window.beforeRenderFrame = []

// ACTUAL CODE

void registerServiceWorker()
watchFov()
initCollisionShapes()

// Create three.js context, add to page
let renderer: THREE.WebGLRenderer
try {
  renderer = new THREE.WebGLRenderer({
    powerPreference: options.gpuPreference,
  })
} catch (err) {
  console.error(err)
  throw new Error(`Failed to create WebGL context, not possible to render (restart browser): ${err.message}`)
}

// renderer.localClippingEnabled = true
initWithRenderer(renderer.domElement)
const renderWrapper = new ViewerWrapper(renderer.domElement, renderer)
renderWrapper.addToPage()
watchValue(options, (o) => {
  renderWrapper.renderInterval = o.frameLimit ? 1000 / o.frameLimit : 0
})

const isFirefox = ua.getBrowser().name === 'Firefox'
if (isFirefox) {
  // set custom property
  document.body.style.setProperty('--thin-if-firefox', 'thin')
}

const isIphone = ua.getDevice().model === 'iPhone' // todo ipad?

if (isIphone) {
  document.documentElement.style.setProperty('--hud-bottom-max', '21px') // env-safe-aria-inset-bottom
}

// Create viewer
const viewer: import('prismarine-viewer/viewer/lib/viewer').Viewer = new Viewer(renderer)
window.viewer = viewer
new THREE.TextureLoader().load(itemsPng, (texture) => {
  viewer.entities.itemsTexture = texture
  // todo unify
  viewer.entities.getItemUv = (id) => {
    const name = loadedData.items[id]?.name
    const uv = itemsAtlases.latest.textures[name]
    if (!uv) {
      const variant = viewer.world.downloadedBlockStatesData[name]?.variants?.['']
      if (!variant) return
      const uvBlock = (Array.isArray(variant) ? variant[0] : variant).model?.elements?.[0]?.faces?.north.texture
      if (!uvBlock) return
      return {
        ...uvBlock,
        size: Math.abs(uvBlock.su),
        texture: viewer.world.material.map
      }
    }
    return {
      ...uv,
      size: itemsAtlases.latest.size,
      texture: viewer.entities.itemsTexture
    }
  }
})
viewer.entities.entitiesOptions = {
  fontFamily: 'mojangles'
}
watchOptionsAfterViewerInit()
watchTexturepackInViewer(viewer)

let mouseMovePostHandle = (e) => { }
let lastMouseMove: number
const updateCursor = () => {
  worldInteractions.update()
}
function onCameraMove (e) {
  if (e.type !== 'touchmove' && !pointerLock.hasPointerLock) return
  e.stopPropagation?.()
  const now = performance.now()
  // todo: limit camera movement for now to avoid unexpected jumps
  if (now - lastMouseMove < 4) return
  lastMouseMove = now
  let { mouseSensX, mouseSensY } = options
  if (mouseSensY === -1) mouseSensY = mouseSensX
  mouseMovePostHandle({
    x: e.movementX * mouseSensX * 0.0001,
    y: e.movementY * mouseSensY * 0.0001
  })
  updateCursor()
}
window.addEventListener('mousemove', onCameraMove, { capture: true })
contro.on('stickMovement', ({ stick, vector }) => {
  if (!isGameActive(true)) return
  if (stick !== 'right') return
  let { x, z } = vector
  if (Math.abs(x) < 0.18) x = 0
  if (Math.abs(z) < 0.18) z = 0
  onCameraMove({ movementX: x * 10, movementY: z * 10, type: 'touchmove' })
  miscUiState.usingGamepadInput = true
})

function hideCurrentScreens () {
  activeModalStacks['main-menu'] = [...activeModalStack]
  insertActiveModalStack('', [])
}

const loadSingleplayer = (serverOverrides = {}, flattenedServerOverrides = {}) => {
  void connect({ singleplayer: true, username: options.localUsername, password: '', serverOverrides, serverOverridesFlat: flattenedServerOverrides })
}
function listenGlobalEvents () {
  window.addEventListener('connect', e => {
    const options = (e as CustomEvent).detail
    void connect(options)
  })
  window.addEventListener('singleplayer', (e) => {
    loadSingleplayer((e as CustomEvent).detail)
  })
}

let listeners = [] as Array<{ target, event, callback }>
let cleanupFunctions = [] as Array<() => void>
// only for dom listeners (no removeAllListeners)
// todo refactor them out of connect fn instead
const registerListener: import('./utilsTs').RegisterListener = (target, event, callback) => {
  target.addEventListener(event, callback)
  listeners.push({ target, event, callback })
}
const removeAllListeners = () => {
  for (const { target, event, callback } of listeners) {
    target.removeEventListener(event, callback)
  }
  for (const cleanupFunction of cleanupFunctions) {
    cleanupFunction()
  }
  cleanupFunctions = []
  listeners = []
}

const cleanConnectIp = (host: string | undefined, defaultPort: string | undefined) => {
  const hostPort = host && /:\d+$/.exec(host)
  if (hostPort) {
    return {
      host: host.slice(0, -hostPort[0].length),
      port: hostPort[0].slice(1)
    }
  } else {
    return { host, port: defaultPort }
  }
}

async function connect (connectOptions: ConnectOptions) {
  if (miscUiState.gameLoaded) return
  miscUiState.hasErrors = false
  lastConnectOptions.value = connectOptions
  removePanorama()

  const { singleplayer } = connectOptions
  const p2pMultiplayer = !!connectOptions.peerId
  miscUiState.singleplayer = singleplayer
  miscUiState.flyingSquid = singleplayer || p2pMultiplayer
  const { renderDistance: renderDistanceSingleplayer, multiplayerRenderDistance } = options
  const server = cleanConnectIp(connectOptions.server, '25565')
  const proxy = cleanConnectIp(connectOptions.proxy, undefined)
  const { username, password } = connectOptions

  console.log(`connecting to ${server.host}:${server.port} with ${username}`)

  hideCurrentScreens()
  setLoadingScreenStatus('Logging in')

  let ended = false
  let bot!: typeof __type_bot
  const destroyAll = () => {
    if (ended) return
    ended = true
    viewer.resetAll()
    localServer = window.localServer = window.server = undefined

    renderWrapper.postRender = () => { }
    if (bot) {
      bot.end()
      // ensure mineflayer plugins receive this event for cleanup
      bot.emit('end', '')
      bot.removeAllListeners()
      bot._client.removeAllListeners()
      //@ts-expect-error TODO?
      bot._client = undefined
      //@ts-expect-error
      window.bot = bot = undefined
    }
    resetStateAfterDisconnect()
    cleanFs()
    removeAllListeners()
  }
  const cleanFs = () => {
    if (singleplayer && !fsState.inMemorySave) {
      possiblyCleanHandle(() => {
        // todo: this is not enough, we need to wait for all async operations to finish
      })
    }
  }
  let lastPacket = undefined as string | undefined
  const onPossibleErrorDisconnect = () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    if (lastPacket && bot?._client && bot._client.state !== 'play') {
      appStatusState.descriptionHint = `Last Server Packet: ${lastPacket}`
    }
  }
  const handleError = (err) => {
    console.error(err)
    errorAbortController.abort()
    if (isCypress()) throw err
    miscUiState.hasErrors = true
    if (miscUiState.gameLoaded) return

    setLoadingScreenStatus(`Error encountered. ${err}`, true)
    onPossibleErrorDisconnect()
    destroyAll()
  }

  const errorAbortController = new AbortController()
  window.addEventListener('unhandledrejection', (e) => {
    if (e.reason.name === 'ServerPluginLoadFailure') {
      if (confirm(`Failed to load server plugin ${e.reason.pluginName} (invoking ${e.reason.pluginMethod}). Continue?`)) {
        return
      }
    }
    handleError(e.reason)
  }, {
    signal: errorAbortController.signal
  })
  window.addEventListener('error', (e) => {
    handleError(e.message)
  }, {
    signal: errorAbortController.signal
  })

  if (proxy) {
    console.log(`using proxy ${proxy.host}:${proxy.port || location.port}`)

    net['setProxy']({ hostname: proxy.host, port: proxy.port })
  }

  const renderDistance = singleplayer ? renderDistanceSingleplayer : multiplayerRenderDistance
  let localServer
  try {
    const serverOptions = defaultsDeep({}, connectOptions.serverOverrides ?? {}, options.localServerOptions, defaultServerOptions)
    Object.assign(serverOptions, connectOptions.serverOverridesFlat ?? {})
    const downloadMcData = async (version: string) => {
      // todo expose cache
      const lastVersion = supportedVersions.at(-1)
      if (version === lastVersion) {
        // ignore cache hit
        versionsByMinecraftVersion.pc[lastVersion]!['dataVersion']!++
      }
      if (!document.fonts.check('1em mojangles')) {
        // todo instead re-render signs on load
        await document.fonts.load('1em mojangles').catch(() => { })
      }
      setLoadingScreenStatus(`Downloading data for ${version}`)
      await downloadSoundsIfNeeded()
      await loadScript(`./mc-data/${toMajorVersion(version)}.js`)
      miscUiState.loadedDataVersion = version
      try {
        await genTexturePackTextures(version)
      } catch (err) {
        console.error(err)
        const doContinue = confirm('Failed to apply texture pack. See errors in the console. Continue?')
        if (!doContinue) {
          throw err
        }
      }
      viewer.setVersion(version)
    }

    // serverOptions.version = '1.18.1'
    const downloadVersion = connectOptions.botVersion || (singleplayer ? serverOptions.version : undefined)
    if (downloadVersion) {
      await downloadMcData(downloadVersion)
    }
    await initWebgpuRenderer(getVersion(downloadVersion), () => {
      renderWrapper.postRender()
    })
    addNewStat('loaded-chunks')

    if (singleplayer) {
      // SINGLEPLAYER EXPLAINER:
      // Note 1: here we have custom sync communication between server Client (flying-squid) and game client (mineflayer)
      // Note 2: custom Server class is used which simplifies communication & Client creation on it's side
      // local server started
      // mineflayer.createBot (see source def)
      // bot._client = bot._client ?? mc.createClient(options) <-- mc-protocol package
      // tcpDns() skipped since we define connect option
      // in setProtocol: we emit 'connect' here below so in that file we send set_protocol and login_start (onLogin handler)
      // Client (class) of flying-squid (in server/login.js of mc-protocol): onLogin handler: skip most logic & go to loginClient() which assigns uuid and sends 'success' back to client (onLogin handler) and emits 'login' on the server (login.js in flying-squid handler)
      // flying-squid: 'login' -> player.login -> now sends 'login' event to the client (handled in many plugins in mineflayer) -> then 'update_health' is sent which emits 'spawn' in mineflayer

      setLoadingScreenStatus('Starting local server')
      localServer = window.localServer = window.server = startLocalServer(serverOptions)
      // todo need just to call quit if started
      // loadingScreen.maybeRecoverable = false
      // init world, todo: do it for any async plugins
      if (!localServer.pluginsReady) {
        await new Promise(resolve => {
          localServer.once('pluginsReady', resolve)
        })
      }

      localServer.on('newPlayer', (player) => {
        // it's you!
        player.on('loadingStatus', (newStatus) => {
          setLoadingScreenStatus(newStatus, false, false, true)
        })
      })
      flyingSquidEvents()
    }

    let initialLoadingText: string
    if (singleplayer) {
      initialLoadingText = 'Local server is still starting'
    } else if (p2pMultiplayer) {
      initialLoadingText = 'Connecting to peer'
    } else {
      initialLoadingText = 'Connecting to server'
    }
    setLoadingScreenStatus(initialLoadingText)
    bot = mineflayer.createBot({
      host: server.host,
      port: server.port ? +server.port : undefined,
      version: connectOptions.botVersion || false,
      ...p2pMultiplayer ? {
        stream: await connectToPeer(connectOptions.peerId!),
      } : {},
      ...singleplayer || p2pMultiplayer ? {
        keepAlive: false,
      } : {},
      ...singleplayer ? {
        version: serverOptions.version,
        connect () { },
        Client: CustomChannelClient as any,
      } : {},
      username,
      password,
      viewDistance: renderDistance,
      checkTimeoutInterval: 240 * 1000,
      noPongTimeout: 240 * 1000,
      closeTimeout: 240 * 1000,
      respawn: options.autoRespawn,
      maxCatchupTicks: 0,
      async versionSelectedHook (client) {
        await downloadMcData(client.version)
        setLoadingScreenStatus(initialLoadingText)
      },
      'mapDownloader-saveToFile': false,
      // "mapDownloader-saveInternal": false, // do not save into memory, todo must be implemeneted as we do really care of ram
    }) as unknown as typeof __type_bot
    window.bot = bot
    earlySoundsMapCheck()
    customEvents.emit('mineflayerBotCreated')
    if (singleplayer || p2pMultiplayer) {
      // in case of p2pMultiplayer there is still flying-squid on the host side
      const _supportFeature = bot.supportFeature
      bot.supportFeature = ((feature) => {
        if (unsupportedLocalServerFeatures.includes(feature)) {
          return false
        }
        return _supportFeature(feature)
      }) as typeof bot.supportFeature

      bot.emit('inject_allowed')
      bot._client.emit('connect')
    } else {
      const setupConnectHandlers = () => {
        bot._client.socket.on('connect', () => {
          console.log('WebSocket connection established')
          //@ts-expect-error
          bot._client.socket._ws.addEventListener('close', () => {
            console.log('WebSocket connection closed')
            setTimeout(() => {
              if (bot) {
                bot.emit('end', 'WebSocket connection closed with unknown reason')
              }
            })
          })
        })
      }
      // socket setup actually can be delayed because of dns lookup
      if (bot._client.socket) {
        setupConnectHandlers()
      } else {
        const originalSetSocket = bot._client.setSocket.bind(bot._client)
        bot._client.setSocket = (socket) => {
          originalSetSocket(socket)
          setupConnectHandlers()
        }
      }

    }
  } catch (err) {
    handleError(err)
  }
  if (!bot) return

  const p2pConnectTimeout = p2pMultiplayer ? setTimeout(() => { throw new Error('Spawn timeout. There might be error on the other side, check console.') }, 20_000) : undefined

  // bot.on('inject_allowed', () => {
  //   loadingScreen.maybeRecoverable = false
  // })

  bot.on('error', handleError)

  bot.on('kicked', (kickReason) => {
    console.log('User was kicked!', kickReason)
    setLoadingScreenStatus(`The Minecraft server kicked you. Kick reason: ${typeof kickReason === 'object' ? JSON.stringify(kickReason) : kickReason}`, true)
    destroyAll()
  })

  const packetBeforePlay = (_, __, ___, fullBuffer) => {
    lastPacket = fullBuffer.toString()
  }
  bot._client.on('packet', packetBeforePlay as any)
  const playStateSwitch = (newState) => {
    if (newState === 'play') {
      bot._client.removeListener('packet', packetBeforePlay)
    }
  }
  bot._client.on('state', playStateSwitch)

  bot.on('end', (endReason) => {
    if (ended) return
    console.log('disconnected for', endReason)
    setLoadingScreenStatus(`You have been disconnected from the server. End reason: ${endReason}`, true)
    onPossibleErrorDisconnect()
    destroyAll()
    if (isCypress()) throw new Error(`disconnected: ${endReason}`)
  })

  onBotCreate()

  bot.once('login', () => {
    worldInteractions.initBot()

    setLoadingScreenStatus('Loading world')
  })

  const spawnEarlier = !singleplayer && !p2pMultiplayer
  // don't use spawn event, player can be dead
  bot.once(spawnEarlier ? 'forcedMove' : 'health', () => {
    errorAbortController.abort()
    const mcData = MinecraftData(bot.version)
    window.PrismarineBlock = PrismarineBlock(mcData.version.minecraftVersion!)
    window.loadedData = mcData
    window.Vec3 = Vec3
    window.pathfinder = pathfinder

    // patch mineflayer
    // todo move to mineflayer
    bot.inventory.on('updateSlot', (index) => {
      if ((index as unknown as number) === bot.quickBarSlot + bot.inventory.hotbarStart) {
        //@ts-expect-error
        bot.emit('heldItemChanged')
      }
    })

    miscUiState.gameLoaded = true
    miscUiState.loadedServerIndex = connectOptions.serverIndex ?? ''
    customEvents.emit('gameLoaded')
    if (p2pConnectTimeout) clearTimeout(p2pConnectTimeout)

    setLoadingScreenStatus('Placing blocks (starting viewer)')
    localStorage.lastConnectOptions = JSON.stringify(connectOptions)
    connectOptions.onSuccessfulPlay?.()
    if (connectOptions.autoLoginPassword) {
      bot.chat(`/login ${connectOptions.autoLoginPassword}`)
    }

    console.log('bot spawned - starting viewer')

    const center = bot.entity.position

    const worldView = window.worldView = new WorldDataEmitter(bot.world, renderDistance, center)

    bot.on('physicsTick', () => updateCursor())


    void initVR()

    renderWrapper.postRender = () => {
      viewer.setFirstPersonCamera(null, bot.entity.yaw, bot.entity.pitch)
    }


    // Link WorldDataEmitter and Viewer
    viewer.listen(worldView)
    worldView.listenToBot(bot)
    void worldView.init(bot.entity.position)

    dayCycle()

    // Bot position callback
    function botPosition () {
      viewer.world.lastCamUpdate = Date.now()
      // this might cause lag, but not sure
      viewer.setFirstPersonCamera(bot.entity.position, bot.entity.yaw, bot.entity.pitch)
      void worldView.updatePosition(bot.entity.position)
    }
    bot.on('move', botPosition)
    botPosition()

    setLoadingScreenStatus('Setting callbacks')

    const maxPitch = 0.5 * Math.PI
    const minPitch = -0.5 * Math.PI
    mouseMovePostHandle = ({ x, y }) => {
      viewer.world.lastCamUpdate = Date.now()
      bot.entity.pitch -= y
      bot.entity.pitch = Math.max(minPitch, Math.min(maxPitch, bot.entity.pitch))
      bot.entity.yaw -= x
    }

    function changeCallback () {
      if (notificationProxy.id === 'pointerlockchange') {
        hideNotification()
      }
      if (renderer.xr.isPresenting) return // todo
      if (!pointerLock.hasPointerLock && activeModalStack.length === 0) {
        showModal({ reactType: 'pause-screen' })
      }
    }

    registerListener(document, 'pointerlockchange', changeCallback, false)

    const cameraControlEl = document.querySelector('#ui-root')

    /** after what time of holding the finger start breaking the block */
    const touchStartBreakingBlockMs = 500
    let virtualClickActive = false
    let virtualClickTimeout
    let screenTouches = 0
    let capturedPointer: { id; x; y; sourceX; sourceY; activateCameraMove; time } | undefined
    registerListener(document, 'pointerdown', (e) => {
      const usingJoystick = options.touchControlsType === 'joystick-buttons'
      const clickedEl = e.composedPath()[0]
      if (!isGameActive(true) || !miscUiState.currentTouch || clickedEl !== cameraControlEl || e.pointerId === undefined) {
        return
      }
      screenTouches++
      if (screenTouches === 3) {
        // todo needs fixing!
        // window.dispatchEvent(new MouseEvent('mousedown', { button: 1 }))
      }
      if (usingJoystick) {
        if (!joystickPointer.pointer && e.clientX < window.innerWidth / 2) {
          joystickPointer.pointer = {
            pointerId: e.pointerId,
            x: e.clientX,
            y: e.clientY
          }
          return
        }
      }
      if (capturedPointer) {
        return
      }
      cameraControlEl.setPointerCapture(e.pointerId)
      capturedPointer = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        sourceX: e.clientX,
        sourceY: e.clientY,
        activateCameraMove: false,
        time: Date.now()
      }
      if (options.touchControlsType !== 'joystick-buttons') {
        virtualClickTimeout ??= setTimeout(() => {
          virtualClickActive = true
          document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }))
        }, touchStartBreakingBlockMs)
      }
    })
    registerListener(document, 'pointermove', (e) => {
      if (e.pointerId === undefined) return
      const supportsPressure = (e as any).pressure !== undefined && (e as any).pressure !== 0 && (e as any).pressure !== 0.5 && (e as any).pressure !== 1 && (e.pointerType === 'touch' || e.pointerType === 'pen')
      if (e.pointerId === joystickPointer.pointer?.pointerId) {
        handleMovementStickDelta(e)
        if (supportsPressure && (e as any).pressure > 0.5) {
          bot.setControlState('sprint', true)
          // todo
        }
        return
      }
      if (e.pointerId !== capturedPointer?.id) return
      window.scrollTo(0, 0)
      e.preventDefault()
      e.stopPropagation()

      const allowedJitter = 1.1
      if (supportsPressure) {
        bot.setControlState('jump', (e as any).pressure > 0.5)
      }
      const xDiff = Math.abs(e.pageX - capturedPointer.sourceX) > allowedJitter
      const yDiff = Math.abs(e.pageY - capturedPointer.sourceY) > allowedJitter
      if (!capturedPointer.activateCameraMove && (xDiff || yDiff)) capturedPointer.activateCameraMove = true
      if (capturedPointer.activateCameraMove) {
        clearTimeout(virtualClickTimeout)
      }
      onCameraMove({ movementX: e.pageX - capturedPointer.x, movementY: e.pageY - capturedPointer.y, type: 'touchmove' })
      capturedPointer.x = e.pageX
      capturedPointer.y = e.pageY
    }, { passive: false })

    const pointerUpHandler = (e: PointerEvent) => {
      if (e.pointerId === undefined) return
      if (e.pointerId === joystickPointer.pointer?.pointerId) {
        handleMovementStickDelta()
        joystickPointer.pointer = null
        return
      }
      if (e.pointerId !== capturedPointer?.id) return
      clearTimeout(virtualClickTimeout)
      virtualClickTimeout = undefined

      if (options.touchControlsType !== 'joystick-buttons') {
        if (virtualClickActive) {
          // button 0 is left click
          document.dispatchEvent(new MouseEvent('mouseup', { button: 0 }))
          virtualClickActive = false
        } else if (!capturedPointer.activateCameraMove && (Date.now() - capturedPointer.time < touchStartBreakingBlockMs)) {
          document.dispatchEvent(new MouseEvent('mousedown', { button: 2 }))
          worldInteractions.update()
          document.dispatchEvent(new MouseEvent('mouseup', { button: 2 }))
        }
      }
      capturedPointer = undefined
      screenTouches--
    }
    registerListener(document, 'pointerup', pointerUpHandler)
    registerListener(document, 'pointercancel', pointerUpHandler)
    registerListener(document, 'lostpointercapture', pointerUpHandler)

    registerListener(document, 'contextmenu', (e) => e.preventDefault(), false)

    registerListener(document, 'blur', (e) => {
      bot.clearControlStates()
    }, false)

    console.log('Done!')

    // todo
    onGameLoad(async () => {
      if (!viewer.world.downloadedBlockStatesData && !viewer.world.customBlockStatesData) {
        await new Promise<void>(resolve => {
          viewer.world.renderUpdateEmitter.once('blockStatesDownloaded', () => resolve())
        })
      }
      miscUiState.serverIp = server.host as string | null
      miscUiState.username = username
    })

    if (appStatusState.isError) return
    setTimeout(() => {
      // todo
      const qs = new URLSearchParams(window.location.search)
      if (qs.get('suggest_save')) {
        showNotification('Suggestion', 'Save the world to keep your progress!', false, undefined, async () => {
          const savePath = await saveToBrowserMemory()
          if (!savePath) return
          const saveName = savePath.split('/').pop()
          bot.end()
          // todo hot reload
          location.search = `loadSave=${saveName}`
        })
      }
    }, 600)

    setLoadingScreenStatus(undefined)
    const start = Date.now()
    let done = false
    void viewer.world.renderUpdateEmitter.on('update', () => {
      // todo might not emit as servers simply don't send chunk if it's empty
      if (!viewer.world.allChunksFinished || done) return
      done = true
      console.log('All done and ready! In', (Date.now() - start) / 1000, 's')
      viewer.render() // ensure the last state is rendered
      document.dispatchEvent(new Event('cypress-world-ready'))
    })
  })

  if (!connectOptions.ignoreQs) {
    // todo cleanup
    customEvents.on('gameLoaded', () => {
      const qs = new URLSearchParams(window.location.search)
      for (let command of qs.getAll('command')) {
        if (!command.startsWith('/')) command = `/${command}`
        bot.chat(command)
      }
    })
  }
}

listenGlobalEvents()
watchValue(miscUiState, async s => {
  if (s.appLoaded) { // fs ready
    const qs = new URLSearchParams(window.location.search)
    if (qs.get('singleplayer') === '1') {
      loadSingleplayer({}, {
        worldFolder: undefined
      })
    }
    if (qs.get('loadSave')) {
      const savePath = `/data/worlds/${qs.get('loadSave')}`
      try {
        await fs.promises.stat(savePath)
      } catch (err) {
        alert(`Save ${savePath} not found`)
        return
      }
      await loadInMemorySave(savePath)
    }
  }
})

// #region fire click event on touch as we disable default behaviors
let activeTouch: { touch: Touch, elem: HTMLElement, start: number } | undefined
document.body.addEventListener('touchend', (e) => {
  if (!isGameActive(true)) return
  if (activeTouch?.touch.identifier !== e.changedTouches[0].identifier) return
  if (Date.now() - activeTouch.start > 500) {
    activeTouch.elem.dispatchEvent(new Event('longtouch', { bubbles: true }))
  } else {
    activeTouch.elem.click()
  }
  activeTouch = undefined
})
document.body.addEventListener('touchstart', (e) => {
  const ignoreElem = (e.target as HTMLElement).matches('vercel-live-feedback') || (e.target as HTMLElement).closest('.hotbar')
  if (!isGameActive(true) || ignoreElem) return
  // we always prevent default behavior to disable magnifier on ios, but by doing so we also disable click events
  e.preventDefault()
  let firstClickable // todo remove composedPath and this workaround when lit-element is fully dropped
  const path = e.composedPath() as Array<{ click?: () => void }>
  for (const elem of path) {
    if (elem.click) {
      firstClickable = elem
      break
    }
  }
  if (!firstClickable) return
  activeTouch = {
    touch: e.touches[0],
    elem: firstClickable,
    start: Date.now(),
  }
}, { passive: false })
// #endregion

void window.fetch('config.json').then(async res => res.json()).then(c => c, (error) => {
  console.warn('Failed to load optional app config.json', error)
  return {}
}).then((config: AppConfig | {}) => {
  miscUiState.appConfig = config
})

// qs open actions
downloadAndOpenFile().then((downloadAction) => {
  if (downloadAction) return
  const qs = new URLSearchParams(window.location.search)
  if (qs.get('reconnect') && process.env.NODE_ENV === 'development') {
    const ip = qs.get('ip')
    const lastConnect = JSON.parse(localStorage.lastConnectOptions ?? {})
    void connect({
      ...lastConnect, // todo mixing is not good idea
      ip: ip || undefined
    })
    return
  }
  if (qs.get('ip') || qs.get('proxy')) {
    const waitAppConfigLoad = !qs.get('proxy')
    const openServerEditor = () => {
      hideModal()
      // show server editor for connect or save
      showModal({ reactType: 'editServer' })
    }
    showModal({ reactType: 'empty' })
    if (waitAppConfigLoad) {
      const unsubscribe = subscribe(miscUiState, checkCanDisplay)
      checkCanDisplay()
      // eslint-disable-next-line no-inner-declarations
      function checkCanDisplay () {
        if (miscUiState.appConfig) {
          unsubscribe()
          openServerEditor()
          return true
        }
      }
    } else {
      openServerEditor()
    }
  }

  void Promise.resolve().then(() => {
    // try to connect to peer
    const peerId = qs.get('connectPeer')
    const version = qs.get('peerVersion')
    if (peerId) {
      let username: string | null = options.guestUsername
      if (options.askGuestName) username = prompt('Enter your username', username)
      if (!username) return
      options.guestUsername = username
      void connect({
        username,
        botVersion: version || undefined,
        peerId
      })
    }
  })
}, (err) => {
  console.error(err)
  alert(`Failed to download file: ${err}`)
})

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
const initialLoader = document.querySelector('.initial-loader') as HTMLElement | null
if (initialLoader) {
  initialLoader.style.opacity = '0'
  initialLoader.style.pointerEvents = 'none'
}
window.pageLoaded = true

void possiblyHandleStateVariable()
