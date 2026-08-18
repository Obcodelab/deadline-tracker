import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './support/e2e-app';

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects an invalid signup payload with a validation error envelope', () => {
    return request(app.getHttpServer())
      .post('/auth/signup')
      .send({ fullName: '', emailAddress: 'not-an-email', password: 'weak' })
      .expect(400)
      .expect((res) => {
        expect(res.body).toMatchObject({
          status: 'error',
          error: { code: 'VALIDATION_ERROR' },
        });
      });
  });

  it('rejects login for an account that does not exist', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({
        emailAddress: 'nobody-e2e@example.com',
        password: 'Password1!',
      })
      .expect(401)
      .expect((res) => {
        expect(res.body).toMatchObject({
          status: 'error',
          error: { code: 'INVALID_CREDENTIALS' },
        });
      });
  });

  it('rejects an unauthenticated request to a protected route', () => {
    return request(app.getHttpServer())
      .get('/courses')
      .expect(401)
      .expect((res) => {
        expect(res.body).toMatchObject({
          status: 'error',
          error: { code: 'UNAUTHORIZED' },
        });
      });
  });
});
