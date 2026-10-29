// The app on the website: the engine runs in the browser; nothing is sent to a server.
import { startApp } from './app.js';
import { hostedBackend } from './hosted-backend.js';

startApp(hostedBackend());
