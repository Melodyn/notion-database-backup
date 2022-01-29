setup:
	cp -u .env.example .env || true
	npm ci
	@echo "\n! Write secrets to a file .env!\n"

start:
	node ./bin/index.js

# dev
lint:
	npx eslint .
test:
	npm test
