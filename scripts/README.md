# Prueba de Trabajo

Se procede a trabajar configurando un entorno de desarrollo con Foundry y Typescript para el
proyecto.
Se crea dos scripts que simulan en [Optimist Goerli](https://goerli-optimism.etherscan.io/) los siguientes pasos:

- a. Depositar una cantidad específica de tokens en el Vault de Perpetual Protocol.
- b. Abrir una posición long en Perpetual Protocol.

Me base en el siguiente repositorio:

- [@perp/curie-contract](https://github.com/perpetual-protocol/perp-curie-contract/tree/main) (source code)

Para los contratos objetivo del protocolo se utilizo la siguiente metadata:

- [Metadata Optimist Goerli / Perpetual Protocol](https://metadata.perp.exchange/v2/core/optimism-goerli.json) 

## Get Started

Por favor chequear la siguiente documentacion:

- [Perpetual Protocol v2 Smart Contract Documentation](https://support.perp.com/hc/en-us)
- [Perpetual Protocol v2 User Docs](https://support.perp.com//)


## Desarrollo en local

Se necesita una version superior a Node.js 16 para compilar. Usar [nvm](https://github.com/nvm-sh/nvm) para cambiar de versiones.

Clonar el repositorio, instalar dependencias, y compilar los contratos:

```bash
git clone https://github.com/Marissccal/perp-curie-contract.git
npm i
npm run build
```

Para correr los tests:

```bash
npm run test
```

## Variables de entorno.

Crear el archivo `.env` en base al archivo de ejemplo `.env.example`, solo agregando la Private Key de la wallet de prueba.

## Obtener ETH en Optimist Goerli

La wallet de prueba debera disponer de `ETH` en Optimist Goerli, por lo cual se sugiere obtener del faucet [LearnWeb3](https://learnweb3.io/faucets/optimism_goerli/).

## ETH a WETH

Para la presente prueba se ha optado por usar como colateral a `WETH`, sin embargo el protocolo acepta varias coins (USDC, USDT, WBTC, etc)

Una vez obtenido el `ETH`, se debera intercambiar en [Uniswap](https://app.uniswap.org/swap) conectando la wallet a la red Optimist e intercambiando `ETH` por `WETH`. En `Seleccionar token` debera poner el contrato de `WETH: 0x4200000000000000000000000000000000000006`, luego hacer el intercambio que desee teniendo en cuenta siempre dejar `ETH` para pagar el gas de las tx.

## Aprobar el dispenser de WETH

Previo a realizar el deposito en Perpetual Protocol, debe dirigirse a [Etherescan Goerli Optimist](https://goerli-optimism.etherscan.io) y realizar el [approve](https://goerli-optimism.etherscan.io/address/0x4200000000000000000000000000000000000006#writeContract). Se conecta la wallet en `Connect to Web3` y se selecciona la funcion:

`1.approbe`

Ingresar los siguientes parametros:

```bash
guy 0x253D7430118Be0B961A5e938d003C6d690d7ce99
wad 115792089237316195423570985008687907853269984665640564039457584007913129639935
```

## Deposito

Primero hacemos el deposito del `WETH` que representa al colateral, para asi obtener `vUSD`, el cual luego usaremos para abrir una posicion en long.

```bash
npx ts-node scripts/tx/deposit.ts
```

El script `deposit.ts` deposita en la variable `amount` la cantidad de 0.001 `WETH`, cambiar ese valor a su criterio, dependiendo de la cantidad de `WETH` que disponga en la wallet como colateral.

## Open Position

Una vez depositado el `WETH` y obtenidos los `vUSD` para abrir posiciones (el token `vUSD` tiene 6 decimales, puede consultar en la funcion [getFreeCollateral](https://goerli-optimism.etherscan.io/address/0x253d7430118be0b961a5e938d003c6d690d7ce99#readProxyContract) la disponibilidad de `vUSD` que tiene la wallet de prueba), procedemos a realizar un long a por ejemplo `vMatic`.

```bash
npx ts-node scripts/tx/openPosition.ts
```

Para apuntar a otro token, puede cambiar el parametro de `baseToken` en el script de `openPosition.ts`, actualmente por defecto lo hacemos a `vMatic`, solamente debe chequear que exista una pool de liquidez del token al que desea abrir posicion. El parametro `isBaseToQuote` en `false` indica una posicion en long, leer [ClearingHouse.openPosition](https://support.perp.com/hc/en-us/articles/7917807368729-Perp-v2-Integration-Guide-Code-Samples#block-be1c8051c62547d399d88935d5ce5bda).

La compra se llevara a cabo por 1 `vUSD` dado el el parametro de `amount` en el script de `openPosition.ts`.

## Ejemplos en Testnet

A continuacion anexo txs con mi [wallet](https://goerli-optimism.etherscan.io/address/0x31df5b8c8d1929a865263d83e07293d981efc225) de pruebas:

- [Deposito]https://goerli-optimism.etherscan.io/tx/0xec0523b5e1fe44e925645ed37b2e4d73261df599333f50a4525c19887aec2c97
- [Long]https://goerli-optimism.etherscan.io/tx/0xb2f72c6f0767174c98a0e6b56740ad2d55f2d75c8242af2f896873c0c61f6c1a