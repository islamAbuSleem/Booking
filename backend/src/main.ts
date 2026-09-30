import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp, logListening } from './bootstrap.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // Stripe webhook signature verification (T27) needs the unparsed body. Set at
    // scaffold so it is never retrofitted. Do NOT also set bodyParser: false.
    rawBody: true,
  });

  configureApp(app);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  logListening(port);
}

await bootstrap();
