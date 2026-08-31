# Como integrar ao seu index.html

## 1. Defina a URL do backend
Logo no início do `<script>`, dentro de `(function(){ ... })()`, adicione:

```js
const API_URL = 'https://SUA-URL-DO-BACKEND.onrender.com'; // troque depois do deploy
```

## 2. Envie a marcação para o backend
No trecho abaixo, dentro do listener `apptForm.addEventListener('submit', ...)`,
logo depois de `await saveData();`, adicione a chamada ao backend:

```js
state.appointments.push(appt);
await saveData();

// NOVO: envia para o backend cuidar do lembrete automático
fetch(API_URL + '/api/appointments', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(appt)
}).catch(err => console.error('Não sincronizou com o servidor de lembretes:', err));

apptForm.reset();
```

## 3. (Opcional) Propague a exclusão
No listener de exclusão da agenda (`agendaList.addEventListener('click', ...)`),
depois de `state.appointments = state.appointments.filter(a=>a.id!==btn.dataset.id);`,
adicione:

```js
fetch(API_URL + '/api/appointments/' + btn.dataset.id, { method: 'DELETE' })
  .catch(err => console.error('Não sincronizou exclusão:', err));
```

Isso evita que o backend continue tentando (ou já tenha) mandar lembrete de um
horário que você cancelou.
