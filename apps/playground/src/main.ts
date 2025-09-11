import { SafeAPI, FilesAdapter } from '@safeapi/sdk';

const el = (id: string) => document.getElementById(id)!;

const ui = `
  <h1>SafeAPI Playground</h1>
  <p>Minimal web app demo. Adapter: <b>FilesAdapter</b></p>
  <div>
    <textarea id="note" rows="4" placeholder="Write a secret note..."></textarea>
    <button id="save">Encrypt & Save</button>
  </div>
  <h3>Notes</h3>
  <ul id="list"></ul>
`;

document.getElementById('app')!.innerHTML = ui;

const api = new SafeAPI({ storage: new FilesAdapter(), defaults: { encryption: 'document' } });
await api.init();

const notesIndex: string[] = [];

async function render() {
  const list = el('list');
  list.innerHTML = '';
  for (const id of notesIndex) {
    const li = document.createElement('li');
    li.textContent = 'decrypting...';
    list.appendChild(li);
    try {
      const doc = await api.data.get<{ text: string; createdAt: number }>({ collection: 'notes', id });
      li.textContent = `${new Date(doc!.createdAt).toLocaleTimeString()}: ${doc!.text}`;
    } catch (e) {
      li.textContent = `Error decrypting: ${String(e)}`;
    }
  }
}

el('save').addEventListener('click', async () => {
  const text = (el('note') as HTMLTextAreaElement).value.trim();
  if (!text) return;
  const id = await api.data.create({ collection: 'notes', doc: { text, createdAt: Date.now() } });
  notesIndex.unshift(id);
  (el('note') as HTMLTextAreaElement).value = '';
  await render();
});

render();

