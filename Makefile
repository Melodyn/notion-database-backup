setup:
	cp -u .env.example .env || true
	npm ci
	@echo "\n! Впишите секреты в файл .env!\n"

start:
	node ./bin/index.js

# dev
lint:
	npx eslint .
test:
	npm test
