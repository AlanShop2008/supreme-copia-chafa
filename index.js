import './config.js'
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys'

import pino from 'pino'
import readline from 'readline'
import { Boom } from '@hapi/boom'
import { loadPlugins, handler } from './handler.js'

const question = (text) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise(resolve => {
    rl.question(text, answer => {
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
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Alan Dev Bot', 'Chrome', '1.0.0']
  })

  if (!conn.authState.creds.registered) {
    let numero = await question('📱 Escribe tu número con país, ejemplo 5215637362813: ')
    numero = numero.replace(/[^0-9]/g, '')

    let code = await conn.requestPairingCode(numero)

    console.log('\n🔐 CÓDIGO DE VINCULACIÓN:')
    console.log(code)
    console.log('\n📲 En WhatsApp ve a Dispositivos vinculados > Vincular con número\n')
  }

  conn.ev.on('creds.update', saveCreds)

  conn.ev.on('messages.upsert', async ({ messages }) => {
    let m = messages[0]
    if (!m.message) return
    if (m.key.remoteJid === 'status@broadcast') return

    await handler(m, conn)
  })

  conn.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update

    if (connection === 'open') {
      console.log('✅ Bot conectado correctamente')
    }

    if (connection === 'close') {
      let reason = new Boom(lastDisconnect?.error)?.output?.statusCode

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
