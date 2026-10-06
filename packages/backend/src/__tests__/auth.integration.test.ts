import request from 'supertest';
import knex from 'knex';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../app.js';
import { databaseConfig, getMigrationDatabaseConfig } from '../config/database.js';

const migrationDatabase = knex(getMigrationDatabaseConfig());
const appDatabase = knex(databaseConfig);

function phone(): string {
  return `07${Date.now().toString().slice(-8)}`;
}

describe('identity API', () => {
  beforeAll(async () => {
    await migrationDatabase.migrate.latest();
  });

  afterAll(async () => {
    await migrationDatabase.destroy();
    await appDatabase.destroy();
  });

  it('registers a user and protects the current-user endpoint with a session cookie', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({
      displayName: 'Amina Wanjiku',
      phone: phone(),
      password: 'correct horse battery',
    });

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({ displayName: 'Amina Wanjiku', phone: expect.stringMatching(/^\+254/) });
    expect(response.headers['set-cookie']?.[0]).toContain('HttpOnly');

    const protectedResponse = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', response.headers['set-cookie'] ?? []);
    expect(protectedResponse.status).toBe(200);
    expect(protectedResponse.body.user.id).toBe(response.body.user.id);
  });

  it('rejects duplicate accounts, invalid credentials, and unauthenticated access', async () => {
    const duplicatePhone = phone();
    const registration = {
      displayName: 'Brian Otieno',
      phone: duplicatePhone,
      password: 'correct horse battery',
    };
    expect((await request(app).post('/api/v1/auth/register').send(registration)).status).toBe(201);
    expect((await request(app).post('/api/v1/auth/register').send(registration)).status).toBe(409);
    expect(
      (await request(app).post('/api/v1/auth/login').send({ phone: duplicatePhone, password: 'wrong password here' })).status,
    ).toBe(401);
    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
  });

  it('invalidates the session after logout', async () => {
    const login = await request(app).post('/api/v1/auth/register').send({
      displayName: 'Chao Njeri',
      phone: phone(),
      password: 'correct horse battery',
    });
    const cookie = login.headers['set-cookie'] ?? [];

    expect((await request(app).post('/api/v1/auth/logout').set('Cookie', cookie)).status).toBe(204);
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('enforces regular-user and admin boundaries on the backend', async () => {
    const regular = await request(app).post('/api/v1/auth/register').send({
      displayName: 'Regular User',
      phone: phone(),
      password: 'correct horse battery',
    });
    const regularCookie = regular.headers['set-cookie'] ?? [];
    expect((await request(app).get('/api/v1/admin/users').set('Cookie', regularCookie)).status).toBe(403);

    await migrationDatabase('user_roles').where({ user_id: regular.body.user.id }).update({ role: 'admin' });
    expect((await request(app).get('/api/v1/admin/users').set('Cookie', regularCookie)).status).toBe(200);
    expect((await request(app).get('/api/v1/admin/transactions').set('Cookie', regularCookie)).status).toBe(200);
  });
});
