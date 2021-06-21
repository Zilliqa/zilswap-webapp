import React, { useState } from 'react';

import MainCard from 'app/layouts/MainCard';
import cls from "classnames";

import { Box, Button, IconButton, } from "@material-ui/core";
import { TextInput } from "./components/TextInput";
import { makeStyles } from "@material-ui/core/styles";
import { AppTheme } from "app/theme/types";
import { FancyButton } from 'app/components';

import { TradeHubSDK, ZILClient } from 'tradehub-api-js';
import { Blockchain, Network, NetworkConfigs, SWTHAddress } from 'tradehub-api-js/build/main/lib/tradehub/utils';
import { ApproveZRC2Params, ZILLockParams } from 'tradehub-api-js/build/main/lib/tradehub/clients';

import { useAsyncTask, useToaster } from "app/utils";

import BigNumber from 'bignumber.js';
import { getAddressFromPrivateKey, Zilliqa } from '@zilliqa-js/zilliqa';
import { Wallet } from '@zilliqa-js/account';
import { generateZILLockToken } from './components/tokens';

const useStyles = makeStyles((theme: AppTheme) => ({
    root: {},
    container: {
        padding: theme.spacing(4, 4, 0),
        [theme.breakpoints.down("xs")]: {
            padding: theme.spacing(2, 2, 0),
        },
        marginBottom: 12
    },
    actionButton: {
        marginTop: theme.spacing(4),
        marginBottom: theme.spacing(4),
        height: 46
    },
    title: {
        marginBottom: 20,
        textAlign: "center"
    }
}))

const initialFormState = {
    zilPrivateKey: '',
    swthAddress: '',
    sourceAddress: '',
    destAddress: '',
}

// check deposit on switcheo side
// returns true if deposit is confirm, otherwise returns false
async function isDepositOnSwth(swthAddress: string) {
    const sdk = new TradeHubSDK({
        network: TradeHubSDK.Network.DevNet,
        debugMode: false,
    })

    const result = await sdk.api.getTransfers({
        account: swthAddress
    })

    console.log(result[0]);
    if (result &&
        result.length > 0 &&
        result[0].transfer_type === "deposit" &&
        result[0].blockchain == "zil" &&
        result[0].contract_hash === "a5484b227f35f5e192e444146a3d9e09f4cdad80" &&
        result[0].denom === "zil" &&
        result[0].status === "success" &&
        result[0].amount === "1") {

        console.log("deposit confirmed; can proceed to withdraw")
        return true
    }
    return false
}

async function isWithdrawFromSwth(swthAddress: string) {
    const sdk = new TradeHubSDK({
        network: TradeHubSDK.Network.DevNet,
        debugMode: true,
    })

    const result = await sdk.api.getTransfers({
        account: swthAddress
    })

    console.log(result[0]);
    if (result &&
        result.length > 0 &&
        result[0].transfer_type === "withdrawal" &&
        result[0].blockchain == "zil" &&
        result[0].denom === "zusd6" &&
        result[0].status === "confirming") {

        console.log("withdraw confirmed")
        return true
    }
    return false
}

const BridgeView: React.FC<React.HTMLAttributes<HTMLDivElement>> = (props: any) => {
    const { children, className, ...rest } = props;
    const classes = useStyles();

    const [runBridge, loading, error] = useAsyncTask("bridge");
    const toaster = useToaster();
    
    const [formState, setFormState] = useState<typeof initialFormState>(initialFormState);

    const onPrivateKeyChange = (key: string = "") => {
        setFormState({
            ...formState,
            zilPrivateKey: key,
        });
    }

    const onSourceAddressChange = (address: string = "") => {
        setFormState({
            ...formState,
            sourceAddress: address,
        });
    }

    const onDestAddressChange = (address: string = "") => {
        setFormState({
            ...formState,
            destAddress: address,
        });
    }

    const onExecute = async () => {
        if (loading) return;

        runBridge(async () => {
            console.log("bridge execute")

            const swthAddress = "swth1pacamg4ey0nx6mrhr7qyhfj0g3pw359cnjyv6d"

            console.log("swth address: %o\n", swthAddress)
            console.log("source address: %o\n", formState.sourceAddress);
            console.log("dest address: %o\n", formState.destAddress);

            const swthNetworkConfig = NetworkConfigs[Network.DevNet] 

            const tradehubZILClient = ZILClient.instance({
                configProvider: {
                    getConfig: () => swthNetworkConfig
                },
                blockchain: Blockchain.Zilliqa,
            });


            const zilliqa = new Zilliqa(tradehubZILClient.getProviderUrl())
            const wallet  = new Wallet(zilliqa.network.provider)
            wallet.addByPrivateKey(formState.zilPrivateKey)
            const zilAddress = getAddressFromPrivateKey(formState.zilPrivateKey)

            const zilLockToken = generateZILLockToken(swthAddress)

            const lockDepositParams: ZILLockParams = {
                address: SWTHAddress.getAddressBytes(swthAddress, Network.DevNet),
                amount: new BigNumber("1000000000000"),
                token: zilLockToken,
                gasPrice: new BigNumber("2000000000"),
                zilAddress: zilAddress.toLowerCase(),
                gasLimit: new BigNumber(25000),
                signer: wallet,
            }

            console.log("depositing into Zilliqa...");

            console.log("sending lock deposit transactions")
            const lock_tx = await tradehubZILClient.lockDeposit(lockDepositParams)

            // TODO: need to dispatch?
            toaster("Submitted", { hash: lock_tx.id });

            await lock_tx.confirm(lock_tx.id!)

            toaster("Deposit confirmed (Zilliqa)", { hash: lock_tx.id });

            let isDeposited = false

            if (lock_tx !== undefined && lock_tx.getReceipt()?.success === true) {
                // check deposit on switcheo    
                for (let attempt = 0; attempt < 20; attempt++) {
                    console.log("checking deposit...");
                    const isConfirmed = await isDepositOnSwth(swthAddress)
                    if (isConfirmed) {
                        isDeposited = true
                        break;
                    }
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }

            if (!isDeposited) {
                console.error("error depositing...")
                return null
            }

            toaster("Deposit confirmed (Tradehub)");

            // initiate withdrawal from tradehub
            const sdk = new TradeHubSDK({
                network: TradeHubSDK.Network.DevNet,
                debugMode: true,
            });

            const mnemonic = ""; // originator swth address mnemonic
            const connectedSDK = await sdk.connectWithMnemonic(mnemonic);
    
            console.log("withdrawing from swth...");
            const withdrawResp = await connectedSDK.coin.withdraw({
                amount: new BigNumber("1").toString(10), // have to be eaxct denom
                denom: "zusd6",
                to_address: "A476FcEdc061797fA2A6f80BD9E020a056904298", // MUST BE CHECKSUM!
                fee_address: "swth1prv0t8j8tqcdngdmjlt59pwy6dxxmtqgycy2h7",
                fee_amount: "1",
                originator: connectedSDK.wallet.bech32Address,
            })
    
            let isWithdrawConfirmed = false
    
            console.log(withdrawResp)
            if (withdrawResp.logs.length > 0 && withdrawResp.logs[0].log === 'Withdrawal success') {
                // check withdraw on switcheo  
                for (let attempt = 0; attempt < 20; attempt++) {
                    console.log("checking deposit...");
                    const isConfirmed = await isWithdrawFromSwth(swthAddress)
                    if (isConfirmed) {
                        isWithdrawConfirmed = true
                        break;
                    }
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
    
            if (isWithdrawConfirmed) {
                toaster("Withdrawal confirmed (Tradehub)");
            }

        })
    }

    return (
        <MainCard {...rest} className={cls(classes.root, className)}>
            <Box display="flex" flexDirection="column" className={classes.container}>
                <h1 className={classes.title}>ZIL to ZUSDT [DEVNET]</h1>
                <TextInput 
                    label="Zilliqa Private Key (Wallet)" 
                    placeholder="e.g. 1ab23..."
                    text={formState.zilPrivateKey}
                    onInputChange={onPrivateKeyChange} />
                <TextInput 
                    label="Zilliqa Address (Source)" 
                    placeholder="e.g. zil1xxxx..."
                    text={formState.destAddress}
                    onInputChange={onSourceAddressChange} />
                <TextInput 
                    label="Zilliqa Address 2 (Destination)" 
                    placeholder="e.g. zil1xxxx..."
                    text={formState.destAddress}
                    onInputChange={onSourceAddressChange} />
                {/* <TextInput 
                    label="Ethereum Address (Destination)" 
                    placeholder="e.g. 0x91a23ab..."
                    text={formState.sourceAddress}
                    onInputChange={onDestAddressChange} /> */}
                <FancyButton
                    className={classes.actionButton}
                    loading={loading}
                    variant="contained"
                    color="primary"
                    onClick={onExecute}>
                    Execute
                </FancyButton>
            </Box>
        </MainCard>
    )
}

export default BridgeView