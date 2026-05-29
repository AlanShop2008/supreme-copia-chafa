import fs from 'fs'
import path from 'path'

global.plugins = {}

export async function loadPlugins() {
  global.plugins = {}

  if (!fs.existsSync('./commands')) fs.mkdirSync('./commands')

  let folders = fs.readdirSync('./commands')

  for (let folder of folders) {
    let dir = `./commands/${folder}`
    if (!fs.statSync(dir).isDirectory()) continue

    let files = fs.readdirSync(dir).filter(file => file.endsWith('.js'))

    for (let file of files) {
      try {
        let filePath = path.resolve(`${dir}/${file}`)
        let plugin = await import(`${filePath}?update=${Date.now()}`)

        if (plugin.default) {
          global.plugins[`${folder}/${file}`] = plugin.default
        }
      } catch (e) {
        console.log(`❌ Error cargando ${folder}/${file}`)
        console.log(e)
      }
    }
  }

  console.log(`✅ Comandos cargados: ${Object.keys(global.plugins).length}`)
}

export async function handler(m, conn) {
  try {
    if (!m.message) return

    let type = Object.keys(m.message)[0]
    let text =
      m.message.conversation ||
      m.message.extendedTextMessage?.text ||
      m.message.imageMessage?.caption ||
      m.message.videoMessage?.caption ||
      ''

    m.text = text
    m.chat = m.key.remoteJid
    m.sender = m.key.participant || m.key.remoteJid
    m.isGroup = m.chat.endsWith('@g.us')
    m.fromMe = m.key.fromMe

    let prefix = global.prefix || '.'
    if (!text.startsWith(prefix)) return

    let args = text.slice(prefix.length).trim().split(/ +/)
    let command = args.shift().toLowerCase()
    let body = args.join(' ')

    for (let plugin of Object.values(global.plugins)) {
      if (!plugin.command) continue

      let match =
        plugin.command instanceof RegExp
          ? plugin.command.test(command)
          : Array.isArray(plugin.command)
            ? plugin.command.includes(command)
            : plugin.command === command

      if (!match) continue

      await plugin(m, {
        conn,
        text: body,
        args,
        command,
        usedPrefix: prefix
      })

      break
    }
  } catch (e) {
    console.log(e)
  }
}
