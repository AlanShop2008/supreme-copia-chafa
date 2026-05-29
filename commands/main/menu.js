import fs from 'fs'

let handler = async (m, { conn }) => {
  let img = './storage/img/catalogo.png'

  let texto = `💜 *ALAN DEV BOT*

👋 Bienvenido al menú principal

🍁 *Comandos*
• .menu
• .ping

✨ Bot conectado correctamente.`

  if (fs.existsSync(img)) {
    await conn.sendMessage(m.chat, {
      image: fs.readFileSync(img),
      caption: texto
    }, { quoted: m })
  } else {
    await conn.sendMessage(m.chat, {
      text: texto
    }, { quoted: m })
  }
}

handler.help = ['menu']
handler.tags = ['main']
handler.command = /^menu$/i

export default handler
