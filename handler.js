import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import syntaxerror from 'syntax-error'
import { format } from 'util'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

global.plugins = global.plugins || {}

const isNumber = x => typeof x === 'number' && !isNaN(x)

function getText(message = {}) {
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.buttonsResponseMessage?.selectedButtonId ||
    message.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ''
  )
}

function decodeJid(jid = '') {
  if (!jid) return jid
  return jid.decodeJid ? jid.decodeJid() : jid
}

export async function loadPlugins(folder = 'commands') {
  const dir = path.join(__dirname, folder)

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file)

    if (fs.statSync(fullPath).isDirectory()) {
      await loadPlugins(path.join(folder, file))
      continue
    }

    if (!file.endsWith('.js')) continue

    const relative = path.join(folder, file).replace(/\\/g, '/')

    try {
      const err = syntaxerror(fs.readFileSync(fullPath), relative, {
        sourceType: 'module',
        allowAwaitOutsideFunction: true
      })

      if (err) {
        console.log(`❌ Error de sintaxis en ${relative}`)
        console.log(format(err))
        continue
      }

      const module = await import(`${pathToFileURL(fullPath).href}?update=${Date.now()}`)
      global.plugins[relative] = module.default || module

      console.log(`✅ Cargado: ${relative}`)
    } catch (e) {
      console.log(`❌ Error cargando ${relative}`)
      console.log(e)
    }
  }

  return global.plugins
}

export async function reloadPlugin(file) {
  try {
    if (!file.endsWith('.js')) return

    const fullPath = path.join(__dirname, 'commands', file)

    if (!fs.existsSync(fullPath)) {
      delete global.plugins[file]
      console.log(`🗑️ Plugin eliminado: ${file}`)
      return
    }

    const err = syntaxerror(fs.readFileSync(fullPath), file, {
      sourceType: 'module',
      allowAwaitOutsideFunction: true
    })

    if (err) {
      console.log(`❌ Error de sintaxis en ${file}`)
      console.log(format(err))
      return
    }

    const module = await import(`${pathToFileURL(fullPath).href}?update=${Date.now()}`)
    global.plugins[file] = module.default || module

    console.log(`♻️ Plugin actualizado: ${file}`)
  } catch (e) {
    console.log(e)
  }
}

export async function handler(chatUpdate) {
  if (!chatUpdate?.messages) return

  let m = chatUpdate.messages[chatUpdate.messages.length - 1]
  if (!m?.message) return
  if (m.key?.remoteJid === 'status@broadcast') return

  try {
    if (!global.db) global.db = { data: { users: {}, chats: {}, settings: {}, stats: {} } }
    if (!global.db.data) global.db.data = { users: {}, chats: {}, settings: {}, stats: {} }
    if (!global.db.data.users) global.db.data.users = {}
    if (!global.db.data.chats) global.db.data.chats = {}
    if (!global.db.data.settings) global.db.data.settings = {}
    if (!global.db.data.stats) global.db.data.stats = {}

    m.chat = m.key.remoteJid
    m.sender = m.key.participant || m.key.remoteJid
    m.fromMe = m.key.fromMe
    m.isGroup = m.chat.endsWith('@g.us')
    m.id = m.key.id
    m.text = getText(m.message)
    m.name = m.pushName || 'Usuario'
    m.exp = 0

    global.db.data.users[m.sender] = global.db.data.users[m.sender] || {
      exp: 0,
      premium: false,
      banned: false
    }

    global.db.data.chats[m.chat] = global.db.data.chats[m.chat] || {
      isBanned: false,
      welcome: false,
      antiLink: false,
      botOff: false
    }

    global.db.data.settings[this.user.jid] = global.db.data.settings[this.user.jid] || {
      self: false,
      autoread: false,
      restrict: true,
      noprefix: false
    }

    const chat = global.db.data.chats[m.chat]
    const user = global.db.data.users[m.sender]
    const settings = global.db.data.settings[this.user.jid]

    if (m.isBaileys && !m.fromMe) return
    if (settings.self && !m.fromMe) return

    let groupMetadata = {}
    let participants = []
    let isAdmin = false
    let isBotAdmin = false

    if (m.isGroup) {
      groupMetadata = await this.groupMetadata(m.chat).catch(() => ({}))
      participants = groupMetadata.participants || []

      const userAdmin = participants.find(p => p.id === m.sender)
      const botJid = this.user.jid
      const botAdmin = participants.find(p => p.id === botJid)

      isAdmin = userAdmin?.admin === 'admin' || userAdmin?.admin === 'superadmin'
      isBotAdmin = botAdmin?.admin === 'admin' || botAdmin?.admin === 'superadmin'
    }

    const senderNum = String(m.sender).replace(/\D/g, '')
    const owners = Array.isArray(global.owner) ? global.owner : []
    const isROwner = owners.some(([num]) => String(num).replace(/\D/g, '') === senderNum)
    const isOwner = isROwner

    let prefix = global.prefix || '.'
    let usedPrefix = ''

    if (prefix instanceof RegExp) {
      const match = prefix.exec(m.text)
      usedPrefix = match ? match[0] : ''
    } else if (Array.isArray(prefix)) {
      usedPrefix = prefix.find(p => m.text.startsWith(p)) || ''
    } else {
      usedPrefix = m.text.startsWith(prefix) ? prefix : ''
    }

    const noPrefix = usedPrefix ? m.text.slice(usedPrefix.length).trim() : ''
    const args = noPrefix ? noPrefix.split(/\s+/) : []
    const command = args.shift()?.toLowerCase() || ''
    const text = args.join(' ')

    const extra = {
      conn: this,
      usedPrefix,
      noPrefix,
      args,
      command,
      text,
      participants,
      groupMetadata,
      user,
      chat,
      isOwner,
      isROwner,
      isAdmin,
      isBotAdmin
    }

    for (const name in global.plugins) {
      const plugin = global.plugins[name]
      if (!plugin || plugin.disabled) continue

      if (typeof plugin.before === 'function') {
        const stop = await plugin.before.call(this, m, extra)
        if (stop) return
      }
    }

    if (!usedPrefix) return

    for (const name in global.plugins) {
      const plugin = global.plugins[name]
      if (!plugin || plugin.disabled || !plugin.command) continue

      const isAccept =
        plugin.command instanceof RegExp
          ? plugin.command.test(command)
          : Array.isArray(plugin.command)
            ? plugin.command.some(cmd => cmd instanceof RegExp ? cmd.test(command) : cmd === command)
            : typeof plugin.command === 'string'
              ? plugin.command === command
              : false

      if (!isAccept) continue

      if (chat.botOff && !isOwner && command !== 'activar') return
      if (chat.isBanned && !plugin.allowBanned) return
      if (user.banned && !plugin.allowBanned) return

      if (plugin.owner && !isOwner) return global.dfail?.('owner', m, this)
      if (plugin.rowner && !isROwner) return global.dfail?.('rowner', m, this)
      if (plugin.group && !m.isGroup) return global.dfail?.('group', m, this)
      if (plugin.private && m.isGroup) return global.dfail?.('private', m, this)
      if (plugin.admin && !isAdmin) return global.dfail?.('admin', m, this)
      if (plugin.botAdmin && !isBotAdmin) return global.dfail?.('botAdmin', m, this)

      m.plugin = name
      m.isCommand = true

      try {
        await plugin.call(this, m, extra)
      } catch (e) {
        m.error = e
        console.log(`❌ Error en plugin ${name}`)
        console.log(e)
        await this.sendMessage(m.chat, {
          text: `❌ Error en comando:\n${e.message || e}`
        }, { quoted: m })
      } finally {
        if (typeof plugin.after === 'function') {
          try {
            await plugin.after.call(this, m, extra)
          } catch (e) {
            console.log(e)
          }
        }
      }

      break
    }
  } catch (e) {
    console.log(e)
  }
}

global.dfail = async (type, m, conn) => {
  const msg = {
    rowner: '🚫 Este comando solo lo puede usar el dueño principal.',
    owner: '🚫 Este comando solo lo puede usar el dueño del bot.',
    group: '🚫 Este comando solo funciona en grupos.',
    private: '🚫 Este comando solo funciona en privado.',
    admin: '🚫 Este comando solo lo pueden usar admins.',
    botAdmin: '🚫 Necesito ser admin para hacer eso.'
  }[type]

  if (msg) {
    await conn.sendMessage(m.chat, { text: msg }, { quoted: m })
  }
}
