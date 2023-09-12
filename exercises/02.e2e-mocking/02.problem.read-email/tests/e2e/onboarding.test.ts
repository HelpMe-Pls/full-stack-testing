import { faker } from '@faker-js/faker'
import { expect, test } from '@playwright/test'
import { prisma } from '#app/utils/db.server.ts'
import { invariant } from '#app/utils/misc.tsx'
import { createUser, insertNewUser } from '../db-utils.ts'
import { waitFor } from '../playwright-utils.ts'

const urlRegex = /(?<url>https?:\/\/[^\s$.?#].[^\s]*)/
function extractUrl(text: string) {
	const match = text.match(urlRegex)
	return match?.groups?.url
}

const usernamesToDelete = new Set<string>()

test.afterEach(async () => {
	for (const username of usernamesToDelete) {
		await prisma.user.delete({ where: { username } })
	}
	usernamesToDelete.clear()
})

test('onboarding with link', async ({ page }) => {
	const onboardingData = {
		...createUser(),
		password: faker.internet.password(),
	}

	await page.goto('/')

	await page.getByRole('link', { name: /log in/i }).click()
	await expect(page).toHaveURL(`/login`)

	const createAccountLink = page.getByRole('link', {
		name: /create an account/i,
	})
	await createAccountLink.click()

	await expect(page).toHaveURL(`/signup`)

	await page.getByRole('textbox', { name: /email/i }).fill(onboardingData.email)
	await page.getByRole('button', { name: /submit/i }).click()
	await expect(
		page.getByRole('button', { name: /submit/i, disabled: true }),
	).toBeVisible()
	await expect(page.getByText(/check your email/i)).toBeVisible()

	const email = (await waitFor(() => {
		// 🐨 once you've implemented your requireEmail function in the resend mock
		// use it here to get the email that was set to the onboardingData.email
		throw new Error('Not yet implemented')
	})) as any

	expect(email.to).toBe(onboardingData.email.toLowerCase())
	expect(email.from).toBe('hello@epicstack.dev')
	expect(email.subject).toMatch(/welcome/i)
	const onboardingUrl = extractUrl(email.text)
	invariant(onboardingUrl, 'Onboarding URL not found')
	await page.goto(onboardingUrl)

	await expect(page).toHaveURL(`/onboarding`)
	await page
		.getByRole('textbox', { name: /^username/i })
		.fill(onboardingData.username)

	await page.getByRole('textbox', { name: /^name/i }).fill(onboardingData.name)
	await page.getByLabel(/^password/i).fill(onboardingData.password)
	await page.getByLabel(/^confirm password/i).fill(onboardingData.password)
	await page.getByLabel(/terms/i).check()
	await page.getByLabel(/remember me/i).check()
	await page.getByRole('button', { name: /Create an account/i }).click()
	usernamesToDelete.add(onboardingData.username)

	await expect(page).toHaveURL(`/`)

	await page.getByRole('link', { name: onboardingData.name }).click()

	await expect(page).toHaveURL(`/users/${onboardingData.username}`)

	await page.getByRole('button', { name: /logout/i }).click()
	await expect(page).toHaveURL(`/`)
})

test('login as existing user', async ({ page }) => {
	const password = faker.internet.password()
	const user = await insertNewUser({ password })
	await page.goto('/login')
	await page.getByRole('textbox', { name: /username/i }).fill(user.username)
	await page.getByLabel(/^password$/i).fill(password)
	await page.getByRole('button', { name: /log in/i }).click()
	await expect(page).toHaveURL(`/`)

	await expect(page.getByRole('link', { name: user.name })).toBeVisible()
})
