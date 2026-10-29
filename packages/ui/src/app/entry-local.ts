// The app as served by `seckit ui` and the Docker image: talks to the local server.
import { startApp } from './app.js';
import { httpBackend } from './http-backend.js';

startApp(httpBackend());
