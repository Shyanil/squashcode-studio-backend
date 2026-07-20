import { createApp } from '@/app';
import { env } from '@/config/env';

const app = createApp();
const host = '0.0.0.0';

app.listen(env.port, host, () => {
  console.log(`Creative Studio API listening on ${host}:${env.port}`);
});
