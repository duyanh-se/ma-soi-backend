import { NestFactory } from '@nestjs/core';

jest.mock('@nestjs/core', () => ({
  NestFactory: { create: jest.fn() },
}));

jest.mock('./app.module', () => ({
  AppModule: class AppModule {},
}));

jest.mock('./config/swagger.config', () => ({
  setupSwagger: jest.fn(),
}));

describe('application binding', () => {
  it('binds HTTP only to localhost by default', async () => {
    const listen = jest.fn().mockResolvedValue(undefined);
    const app = {
      enableCors: jest.fn(),
      setGlobalPrefix: jest.fn(),
      useGlobalPipes: jest.fn(),
      listen,
    };
    (NestFactory.create as jest.Mock).mockResolvedValue(app);

    require('./main');

    await new Promise((resolve) => setImmediate(resolve));
    expect(listen).toHaveBeenCalledWith(3000, '127.0.0.1');
  });
});
