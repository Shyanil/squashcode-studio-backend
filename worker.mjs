import { httpServerHandler } from 'cloudflare:node';
import { createApp } from './src/app.ts';

const app = createApp({ requestLogging: false });
app.listen(3000);

export default httpServerHandler({ port: 3000 });
