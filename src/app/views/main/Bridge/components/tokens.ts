import { Token } from "tradehub-api-js";

//TODO : denom to retrieve from tradehub

export function generateZILLockToken(swthAddress: string) : Token {
    return {
        name: 'Zilliqa',
        symbol: 'ZIL',
        denom: 'zil',
        decimals: 12,
        blockchain: 'zil',
        chain_id: 110,
        asset_id: '0000000000000000000000000000000000000000',
        is_active: true,
        is_collateral: false,
        lock_proxy_hash: 'a5484b227f35f5e192e444146a3d9e09f4cdad80',
        delegated_supply: '0',
        originator: `${swthAddress}` 
    }
}