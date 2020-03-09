import * as bsv from 'bsv';
import { BoostClient } from '../boostpow-js/lib';
import { BoostPowStringModel } from '../boostpow-js/lib/boost-pow-string-model';
import { BoostPowJobModel } from '../boostpow-js/lib/boost-pow-job-model';
import { BoostPowJobProofModel } from '../boostpow-js/lib/boost-pow-job-proof-model';
import { BoostPowMetadataModel } from '../boostpow-js/lib/boost-pow-metadata-model';
import { BoostPowSimpleMinerModel } from '../boostpow-js/lib/boost-pow-simple-miner-model';
import { BoostUtils } from '../boostpow-js/lib/boost-utils';
import { APIClient } from '../boostpow-js/lib/boost-graph-api-client';


const chalk = require('chalk');
const prompt = require('prompt-async');
const boost = require('boostpow-js');
const PrivateKey = bsv.PrivateKey;
const Opcode = bsv.Opcode;
const Transaction = bsv.Transaction;
const BN = bsv.crypto.BN;
const sigtype = bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID;
const flags = bsv.Script.Interpreter.SCRIPT_VERIFY_MINIMALDATA | bsv.Script.Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID | bsv.Script.Interpreter.SCRIPT_ENABLE_MAGNETIC_OPCODES | bsv.Script.Interpreter.SCRIPT_ENABLE_MONOLITH_OPCODES;

export class CPUMiner {

   sign(tx, target=''){
    const privKey = PrivateKey.fromRandom();
    const signature = Transaction.sighash.sign(tx, privKey, sigtype, 0, tx.inputs[0].output.script, new bsv.crypto.BN(tx.inputs[0].output.satoshis), flags);
    if(target!=''){
      const sig256 = bsv.crypto.Hash.sha256(Buffer.concat([signature.toBuffer(), Buffer.from(sigtype.toString(16), 'hex')])).toString('hex');
      if(!sig256.startsWith(target)){
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(chalk.red(sig256));
        return(false);
      } else {
        console.log();
        console.log(chalk.green(sig256));
      }
    }
    const unlockingScript = new bsv.Script({});
    unlockingScript
      .add(
        Buffer.concat([
          signature.toBuffer(),
          Buffer.from([sigtype & 0xff])
        ])
      )
      .add(privKey.toPublicKey().toBuffer());
    tx.inputs[0].setScript(unlockingScript);
    console.log(chalk.green(`Signed ${target} with ${privKey.toString()}`));
    return tx;
  }

  async start() {
    try {
      const {txid} = await prompt.get(["txid"]);
      if(txid === 'exit') return; //let them exit
      let tx;
      let index = -1;
      let boostJob;
      try {
        boostJob = await BoostClient.loadBoostJob(txid);
      } catch (ex) {
        console.log('ex', ex);
        throw("TX not found.");
      }
      if(!boostJob){
        throw("No Boost outputs found");
      }

      let {to} = await prompt.get(["to"]);
      if(txid === 'exit') return; //let them exit
      if(!to.length){
        throw("No address found.");
      }
      try {
        to = bsv.Script.buildPublicKeyHashOut(to);
      } catch(e){
        throw("Invalid address");
      }
      console.log("Automatically publish when mined? Y/N");
      let {publish} = await prompt.get(["publish"]);
      publish = (publish.toLowerCase()[0] == 'y') ? true : false;
      console.log(chalk.green(`Mining TX ${txid} output ${index}`));
      console.log(chalk.green(`Pay to: ${to}`));
      this.mineId(tx, index, to, publish);
    } catch(e){
      console.log(chalk.red(e));
      this.start();
    }
  }

  async mineId(from, index, to, publish) {
    const vout = from.vout[index];
    const value = Math.floor(vout.value*1e8);
    const targetScript = bsv.Script.fromHex(vout.scriptPubKey.hex);
    const target = targetScript.toASM().split(" ")[1].toString('hex');

    //Make initial TX
    let tx = new Transaction();
    tx.addInput(
      new Transaction.Input({
        output: new Transaction.Output({
          script: targetScript,
          satoshis: value
        }),
        prevTxId: from.txid,
        outputIndex: index,
        script: bsv.Script.empty()
      })
    );

    tx.addOutput(
      new Transaction.Output({
        satoshis: value-218,
        script: to
      })
    );

    console.log(chalk.green(`Targeting: ${target}`));
    let foundPowString;
    while(!foundPowString){
      foundPowString = this.sign(tx, target);
    }
    console.log(chalk.yellow(tx.uncheckedSerialize()));
    if(!!publish){
      try {
        const {data} = await boost.sned(tx.uncheckedSerialize());
        console.log(chalk.green('Published ' + Buffer.from(tx._getHash()).reverse().toString('hex')));
      } catch(e) {
        console.log(chalk.red(JSON.stringify({error: e.response.data})));
      }
    } else {
      return;
    }
  }
}

const cpuMiner = new CPUMiner();
cpuMiner.start();
