import './config.js'

import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason
} from '@whiskeysockets/baileys'

import pino from 'pino'
import readline from 'readline'
import { Boom } from '@hapi/boom'
import { loadPlugins, handler } from './handler.js'

const question = (texto) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise(resolve => {
    rl.question(texto, answer => {
      rl.close()
      resolve(answer)
    })
  })
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./session')
  const { version } = await fetchLatestBaileysVersion()

  await loadPlugins()

  const conn = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Alan Dev Bot', 'Chrome', '1.0.0'],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(
        state.keys,
        pino({ level: 'fatal' })
      )
    }
  })

  if (!conn.authState.creds.registered) {
    let numero = global.botNumber

    if (!numero) {
      numero = await question('📱 Escribe tu número con país. Ejemplo 5215637362813: ')
    }

    numero = numero.replace(/[^0-9]/g, '')

    setTimeout(async () => {
      try {
        const code = await conn.requestPairingCode(numero)
        console.log('\n🔐 CÓDIGO DE VINCULACIÓN:')
        console.log(code?.match(/.{1,4}/g)?.join('-') || code)
        console.log('\n📲 WhatsApp > Dispositivos vinculados > Vincular con número\n')
      } catch (e) {
        console.log('❌ Error generando código:', e)
      }
    }, 2000)
  }

  conn.ev.on('creds.update', saveCreds)

  conn.ev.on('messages.upsert', async (chatUpdate) => {
    try {
      await handler.call(conn, chatUpdate)
    } catch (e) {
      console.log(e)
    }
  })

  conn.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update

    if (connection === 'open') {
      console.log('✅ Alan Dev Bot conectado correctamente')
    }

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode

      if (reason === DisconnectReason.loggedOut) {
        console.log('❌ Sesión cerrada. Borra la carpeta session y vuelve a vincular.')
      } else {
        console.log('♻️ Reconectando...')
        startBot()
      }
    }
  })
}

startBot()
