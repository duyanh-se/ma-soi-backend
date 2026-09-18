import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Express } from 'express';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Game API (e2e)', () => {
  let app: INestApplication<Express>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => app.close());

  it('starts after the host configures exactly one role per player', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/games')
      .send({ hostName: 'Alice' })
      .expect(201);
    const body = response.body as { gameId: string; hostPlayerId: string };
    expect(body.gameId).toBeDefined();
    expect(body.hostPlayerId).toBeDefined();

    for (const name of ['Bình', 'Chi', 'Dũng', 'Giang']) {
      await request(app.getHttpServer())
        .post(`/api/games/${body.gameId}/join`)
        .send({ name })
        .expect(201);
    }

    await request(app.getHttpServer())
      .post(`/api/games/${body.gameId}/configuration`)
      .send({
        playerId: body.hostPlayerId,
        roles: ['WOLF', 'VILLAGER', 'SEER', 'GUARD', 'FOOL'],
      })
      .expect(200);

    const startResponse = await request(app.getHttpServer())
      .post(`/api/games/${body.gameId}/start`)
      .send({ playerId: body.hostPlayerId })
      .expect(200);
    const startBody = startResponse.body as { game: { players: unknown[] } };
    expect(startBody.game.players).toHaveLength(5);
  });
});
