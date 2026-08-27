# Lastro Self-Hosted Server

Servidor local do Lastro para rodar em um MacBook pessoal, sem expor publicamente.

## Ideia

- O app roda no MacBook servidor com Next.js em modo produção.
- Os dados ficam em SQLite em `~/LastroData/lastro.sqlite` por padrão.
- O macOS mantém o app ativo com `launchd`.
- Para acessar de outros dispositivos sem publicar na internet, use Tailscale.

## Instalar no MacBook servidor

Copie o projeto para o MacBook servidor e rode:

```sh
SelfHostedServer/install-server.sh
```

Por padrão instala em:

```text
~/Developer/LastroServer
~/LastroData
```

## Operar

```sh
~/Developer/LastroServer/lastroctl.sh status
~/Developer/LastroServer/lastroctl.sh logs
~/Developer/LastroServer/lastroctl.sh restart
~/Developer/LastroServer/lastroctl.sh stop
~/Developer/LastroServer/lastroctl.sh start
```

## Acesso privado com Tailscale

1. Instale Tailscale no MacBook servidor e nos seus dispositivos.
2. Para acessar de outro dispositivo via Tailscale, edite `~/Developer/LastroServer/.env` e use `LASTRO_HOST=0.0.0.0`.
3. Reinicie:

```sh
~/Developer/LastroServer/lastroctl.sh restart
```

Acesse pelo nome/IP Tailscale do Mac servidor:

```text
http://macbook-servidor:3030
```

## Backup

Faça backup de `~/LastroData`. Time Machine já é suficiente para começar.

## Troubleshooting: npm quebrado

Se aparecer algo como:

```text
npm error Class extends value undefined is not a constructor or null
```

O problema está no Node/npm do Mac servidor, antes do Lastro instalar. Rode:

```sh
node -v
npm -v
which node
which npm
```

O Lastro precisa de Node LTS 22 ou 24 com `node:sqlite`. Evite Node 25 por enquanto; ele pode quebrar o npm nesse erro de `minipass-collect`. Com Homebrew, a correção mais simples costuma ser:

```sh
brew install node@24
brew unlink node
brew link --overwrite --force node@24
hash -r
node -v
npm -v
```

Depois rode novamente:

```sh
SelfHostedServer/install-server.sh
```
