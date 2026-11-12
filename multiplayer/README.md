# BATTLE CARDS RPG — modo multiplayer

Este diretório contém uma **versão multiplayer experimental** do jogo. O jogo principal contra bots continua em `/index.html` na raiz do repositório e **não foi substituído**.

## Jogar com amigos

1. Publique **este servidor Node.js**, pois o GitHub Pages não hospeda servidores WebSocket.
2. Todos abrem a **mesma URL** do servidor publicado.
3. Um jogador clica em **JOGAR ONLINE → CRIAR SALA PRIVADA**.
4. Compartilha o **código de 6 caracteres** da sala.
5. O amigo abre a mesma URL, escolhe **ENTRAR NA SALA** e digita o código.

A versão atual aceita **2 jogadores por partida**, com cartas privadas, turnos, ataques e efeitos de vida/escudo. Há também busca pública. É uma versão experimental com regras adaptadas; não é o mesmo motor completo do jogo offline.

## Hospedar no Render

1. Entre em https://dashboard.render.com/ e conecte sua conta GitHub.
2. Clique em **New → Web Service** e selecione `GUILHERME-CHAMPI/battle-cards-rpg`.
3. Configure **Root Directory** como `multiplayer`.
4. Selecione o ambiente **Node**, com **Build Command** `npm install` e **Start Command** `npm start`.
5. Publique e use o endereço HTTPS fornecido pelo Render para todos os jogadores. O cliente troca automaticamente para `wss://` quando o servidor usa HTTPS.

A disponibilidade e o preço dos planos de hospedagem devem ser confirmados diretamente no provedor. Em hospedagens com suspensão por inatividade, o primeiro acesso pode demorar.

## Teste local

No terminal:

```bash
cd multiplayer
npm install
npm start
```

Acesse http://localhost:3000 em duas abas ou dispositivos na mesma rede (usando o endereço do PC para o segundo dispositivo).

## Observações

- Não basta abrir `multiplayer/public/index.html` diretamente do computador para jogar online.
- O jogo online necessita de servidor ativo enquanto há partidas.
- O ranking online persistente ainda não foi implementado.
- Ainda é necessário testar uma partida real entre dois navegadores antes de considerar o multiplayer finalizado.
