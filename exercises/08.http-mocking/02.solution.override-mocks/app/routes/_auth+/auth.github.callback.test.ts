import { faker } from '@faker-js/faker'
import { rest } from 'msw'
import * as setCookieParser from 'set-cookie-parser'
import { afterEach, expect, test } from 'vitest'
import { invariant } from '#app/utils/misc.tsx'
import { sessionStorage } from '#app/utils/session.server.ts'
import { server } from '#tests/mocks/index.ts'
import { consoleError } from '#tests/setup/setup-test-env.ts'
import { ROUTE_PATH, loader } from './auth.github.callback.ts'

const BASE_URL = 'https://www.epicstack.dev'

afterEach(() => {
	server.resetHandlers()
})

test('a new user goes to onboarding', async () => {
	const url = new URL(ROUTE_PATH, BASE_URL)
	const state = faker.string.uuid()
	const code = faker.string.uuid()
	url.searchParams.set('state', state)
	url.searchParams.set('code', code)
	const cookieSession = await sessionStorage.getSession()
	cookieSession.set('oauth2:state', state)
	const setCookieHeader = await sessionStorage.commitSession(cookieSession)
	const request = new Request(url.toString(), {
		method: 'GET',
		headers: { cookie: convertSetCookieToCookie(setCookieHeader) },
	})
	const response = await loader({ request, params: {}, context: {} })
	assertRedirect(response, '/onboarding/github')
})

test('when auth fails, send the user to login with a toast', async () => {
	server.use(
		http.post('https://github.com/login/oauth/access_token', async () => {
			return new Response('error', { status: 400 })
		}),
	)
	const url = new URL(ROUTE_PATH, BASE_URL)
	const state = faker.string.uuid()
	const code = faker.string.uuid()
	url.searchParams.set('state', state)
	url.searchParams.set('code', code)
	const cookieSession = await sessionStorage.getSession()
	cookieSession.set('oauth2:state', state)
	const setCookieHeader = await sessionStorage.commitSession(cookieSession)
	const request = new Request(url.toString(), {
		method: 'GET',
		headers: { cookie: convertSetCookieToCookie(setCookieHeader) },
	})
	const response = await loader({ request, params: {}, context: {} }).catch(
		e => e,
	)
	invariant(response instanceof Response, 'response should be a Response')
	assertRedirect(response, '/login')
	assertToastSent(response)
	expect(consoleError).toHaveBeenCalledTimes(1)
	consoleError.mockClear()
})

function assertToastSent(response: Response) {
	const setCookie = response.headers.get('set-cookie')
	invariant(setCookie, 'set-cookie header should be set')
	const parsedCookie = setCookieParser.splitCookiesString(setCookie)
	expect(parsedCookie).toEqual(
		expect.arrayContaining([expect.stringContaining('en_toast')]),
	)
}

function assertRedirect(response: Response, redirectTo: string) {
	expect(response.status).toBeGreaterThanOrEqual(300)
	expect(response.status).toBeLessThan(400)
	expect(response.headers.get('location')).toBe(redirectTo)
}

function convertSetCookieToCookie(setCookie: string) {
	const parsedCookie = setCookieParser.parseString(setCookie)
	return new URLSearchParams({
		[parsedCookie.name]: parsedCookie.value,
	}).toString()
}
