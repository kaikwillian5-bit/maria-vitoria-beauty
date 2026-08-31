require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const cron = require('node-cron');
const twilio = require('twilio');

const app = express();
app.use(cors());
app.use(express.json());

// ---------- Banco de dados ----------
const db = new Database('agenda.db');
db.exec(`
CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  client TEXT NOT NULL,
  phone TEXT,
  service TEXT,
  date TEXT NOT NULL,   -- YYYY-MM-DD
  time TEXT NOT NULL,   -- HH:MM
  notes TEXT,
  notified INTEGER DEFAULT 0
)
`);

// ---------- Twilio ----------
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

function normalizePhone(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return null;
  // Se já vier com DDI (55...) mantém, senão assume Brasil
  return digits.startsWith('55') ? '+' + digits : '+55' + digits;
}

// ---------- Rotas ----------

// Criar agendamento (chamado pelo front-end quando a marcação é confirmada)
app.post('/api/appointments', (req, res) => {
  const { id, client, phone, service, date, time, notes } = req.body;
  if (!client || !date || !time) {
    return res.status(400).json({ error: 'Dados incompletos: cliente, data e horário são obrigatórios.' });
  }
  db.prepare(`
    INSERT OR REPLACE INTO appointments (id, client, phone, service, date, time, notes, notified)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `).run(id, client, phone || null, service || null, date, time, notes || null);
  res.status(201).json({ ok: true });
});

// Listar agendamentos (opcionalmente filtrando por data: /api/appointments?date=2026-08-31)
app.get('/api/appointments', (req, res) => {
  const { date } = req.query;
  const rows = date
    ? db.prepare('SELECT * FROM appointments WHERE date = ? ORDER BY time').all(date)
    : db.prepare('SELECT * FROM appointments ORDER BY date, time').all();
  res.json(rows);
});

// Excluir agendamento
app.delete('/api/appointments/:id', (req, res) => {
  db.prepare('DELETE FROM appointments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Tarefa agendada: roda a cada minuto ----------
// Verifica quem tem horário marcado daqui a ~30 minutos e ainda não foi avisado.
cron.schedule('* * * * *', async () => {
  const now = new Date();
  const pendentes = db.prepare('SELECT * FROM appointments WHERE notified = 0').all();

  for (const appt of pendentes) {
    if (!appt.phone) continue;

    const apptDateTime = new Date(`${appt.date}T${appt.time}:00`);
    const diffMinutes = (apptDateTime - now) / 60000;

    // janela de 1 minuto em torno dos 30 min de antecedência
    if (diffMinutes <= 30 && diffMinutes > 29) {
      const to = normalizePhone(appt.phone);
      if (!to) continue;

      try {
        await twilioClient.messages.create({
          from: process.env.TWILIO_WHATSAPP_FROM, // ex: whatsapp:+14155238886 (sandbox)
          to: `whatsapp:${to}`,
          // ATENÇÃO: em produção, mensagens iniciadas pela empresa (fora de uma
          // conversa iniciada pela cliente nas últimas 24h) exigem um TEMPLATE
          // aprovado pela Meta. Troque o "body" abaixo por contentSid + contentVariables
          // com o template aprovado. No Sandbox do Twilio, texto livre funciona para testes.
          body: `Olá, ${appt.client}! Passando para lembrar do seu horário na Maria Vitória Beauty hoje às ${appt.time}${appt.service ? ' — ' + appt.service : ''}. Até já! 💅`,
        });
        db.prepare('UPDATE appointments SET notified = 1 WHERE id = ?').run(appt.id);
        console.log(`Lembrete enviado para ${appt.client} (${to})`);
      } catch (err) {
        console.error(`Erro ao enviar lembrete para ${appt.client}:`, err.message);
      }
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
