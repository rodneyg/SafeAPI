import { SafeAPI, FilesAdapter } from '../src/index';

async function main() {
  const storage = new FilesAdapter();
  const api = new SafeAPI({
    storage,
    defaults: { encryption: 'document', audit: false },
  });
  await api.init();

  const id = await api.data.create({ collection: 'notes', doc: { text: 'Hello SafeAPI', createdAt: Date.now() } });
  console.log('Created id:', id);
  const doc = await api.data.get<{ text: string; createdAt: number }>({ collection: 'notes', id });
  console.log('Decrypted doc:', doc);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

