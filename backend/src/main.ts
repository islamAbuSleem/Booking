import { Logger, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // Stripe webhook signature verification (T27) needs the unparsed body. Set at
    // scaffold so it is never retrofitted. Do NOT also set bodyParser: false.
    rawBody: true,
  })

  app.setGlobalPrefix('api')

  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  })

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )

  const port = Number(process.env.PORT ?? 3000)
  await app.listen(port)

  new Logger('bootstrap').log(`[bootstrap] api listening on :${port}`)
}

await bootstrap()
