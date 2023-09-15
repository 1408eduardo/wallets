import {
  CosmosRequestAccountResponse,
  CosmosSignAminoDoc,
  CosmosSignDirectDoc,
  CosmosSignOptions,
  CosmosProto,
  getCosmosTxProto,
  getCosmosTxProtoBytes,
} from '@cosmostation/wallets';
import { useCallback, useEffect, useMemo, useState } from 'react';
import useCosmosWallets from './useCosmosWallets';

export type CosmosSignAndSendTransactionProps = Omit<CosmosProto, 'chain_id' | 'signer' | 'public_key'>;

export type CosmosSignDirectDocument = Omit<CosmosSignDirectDoc, 'chain_id'>;
export type CosmosSignAminoDocument = Omit<CosmosSignAminoDoc, 'chain_id'>;

export default function useCosmosAccount(chainId: string) {
  const { currentWallet, closeWallet } = useCosmosWallets();

  const [account, setAccount] = useState<CosmosRequestAccountResponse | undefined>();
  const [error, setError] = useState<string | undefined>();

  const requestAccount = useCallback(async () => {
    try {
      if (currentWallet) {
        await currentWallet.methods.connect(chainId);

        try {
          const responseAccount = await currentWallet.methods.getAccount(chainId);

          setAccount(responseAccount);
          setError(undefined);
        } catch (e) {
          setAccount(undefined);
          setError(e.message);
        }
      } else {
        setAccount(undefined);
        setError('No wallet selected');
      }
    } catch (e) {
      setAccount(undefined);
      setError(`Unsupported chainId: ${chainId}`);
    }
  }, [chainId, currentWallet]);

  const methods = useMemo(() => {
    if (currentWallet && account) {
      const methods = currentWallet.methods;
      const sendTransaction = (tx_bytes: Uint8Array | string, mode?: number) => {
        return methods.sendTransaction(chainId, tx_bytes, mode);
      };

      const signAmino = (document: CosmosSignAminoDoc, options?: CosmosSignOptions) => {
        return methods.signAmino(chainId, { ...document, chain_id: chainId }, options);
      };

      const signDirect = (document: CosmosSignDirectDocument, options?: CosmosSignOptions) => {
        if (account.is_ledger) {
          throw new Error('Ledger does not support signAndSendTransaction');
        }

        return methods.signDirect(chainId, { ...document, chain_id: chainId }, options);
      };

      const signAndSendTransaction = async (props: CosmosSignAndSendTransactionProps, options?: CosmosSignOptions) => {
        if (account.is_ledger) {
          throw new Error('Ledger does not support signAndSendTransaction');
        }

        const CosmosProto = await getCosmosTxProto({
          chain_id: chainId,
          signer: account.address,
          public_key: { type_url: account.public_key.type, key: account.public_key.value },
          ...props,
        });

        const signDirectResponse = await signDirect(
          {
            auth_info_bytes: CosmosProto.auth_info_bytes,
            body_bytes: CosmosProto.body_bytes,
            account_number: CosmosProto.account_number,
          },
          options
        );

        const tx_bytes = await getCosmosTxProtoBytes({
          signature: signDirectResponse.signature,
          ...signDirectResponse.signed_doc,
        });
        const response = await sendTransaction(tx_bytes, 2);

        return response;
      };

      const signMessage = async (message: string) => {
        if (!methods.signMessage) {
          throw new Error('signMessage is not supported');
        }
        return methods.signMessage?.(chainId, message, account.address);
      };

      const verifyMessage = async (message: string, signature: string) => {
        if (!methods.verifyMessage) {
          throw new Error('verifyMessage is not supported');
        }
        return methods.verifyMessage?.(chainId, message, account.address, signature, account.public_key.value);
      };

      const disconnect = async () => {
        closeWallet();
      };

      return { sendTransaction, signAmino, signDirect, signAndSendTransaction, signMessage, verifyMessage, disconnect };
    }

    return undefined;
  }, [account, chainId, closeWallet, currentWallet]);

  useEffect(() => {
    requestAccount();
  }, [requestAccount]);

  useEffect(() => {
    currentWallet?.events.on('AccountChanged', requestAccount);
    return () => {
      currentWallet?.events.off('AccountChanged', requestAccount);
    };
  }, [currentWallet?.events, requestAccount]);

  const returnData = useMemo(() => {
    if (account) {
      return { account, methods };
    }

    return undefined;
  }, [account, methods]);

  return {
    data: returnData,
    error,
    mutate: requestAccount,
  };
}
