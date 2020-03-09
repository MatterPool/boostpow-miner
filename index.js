const axios = require('axios');
const bsv = require('bsv');
const chalk = require('chalk');
const prompt = require('prompt-async');
const boost = require('boostpow-js');
const PrivateKey = bsv.PrivateKey;
const Opcode = bsv.Opcode;
const Transaction = bsv.Transaction;
const BN = bsv.crypto.BN;
const cryptoRandomString = require('crypto-random-string');

const sigtype = bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID;
const flags = bsv.Script.Interpreter.SCRIPT_VERIFY_MINIMALDATA | bsv.Script.Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID | bsv.Script.Interpreter.SCRIPT_ENABLE_MAGNETIC_OPCODES | bsv.Script.Interpreter.SCRIPT_ENABLE_MONOLITH_OPCODES;

function sign(tx, target=''){
  const privKey = PrivateKey.fromRandom();
  console.log('toString', tx.toString());

  const signature = Transaction.sighash.sign(tx, privKey, sigtype, 0, tx.inputs[0].output.script, new bsv.crypto.BN(tx.inputs[0].output.satoshis), flags);
  if(target!=''){
    const sig256 = bsv.crypto.Hash.sha256(Buffer.concat([signature.toBuffer(), Buffer.from(sigtype.toString(16), 'hex')])).toString('hex');
    if(!sig256.startsWith(target)){
      process.stdout.clearLine();
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


const start = async() => {
  try {
    const {txid} = await prompt.get(["txid"]);
    if(txid === 'exit') return;
    let boostJob;
    try {
      boostJob = await boost.Graph().loadBoostJob(txid);
    } catch(e) {
      throw(e);
    }
    console.log('Found Boost Job', 'ScriptHash', boostJob.getScriptHash(), 'Data', boostJob, boostJob.toObject(), 'Txid', boostJob.getTxid());

    // Test public key: 030511ec53f1cfcb0b348b8349b940900672259a46b78807b80e07aa846f506d32
    let {toPublicKey} = await prompt.get(["toPublicKey"]);
    if(txid === 'exit') return; //let them exit
    if(!toPublicKey.length){
      throw("No public key found.");
    }
    try {
      toPublicKey = bsv.PublicKey.fromHex(toPublicKey);
    } catch(e){
      throw("Invalid public key");
    }
    console.log('Public key address: ', toPublicKey.toAddress());
    console.log("Automatically publish when mined? Y/N");
    let {publish} = await prompt.get(["publish"]);
    publish = (publish.toLowerCase()[0] == 'y') ? true : false;
    console.log(chalk.green(`Mining TX ${boostJob.getTxid()} output ${boostJob.getVout()}`));
    console.log(chalk.green(`Pay to: ${toPublicKey.toAddress()}`));
    mineId(boostJob, toPublicKey, publish);
  } catch(e){
    console.log(chalk.red(e));
    start();
  }
}

const mineId = async(boostJob, toPublicKey, publish) => {
    let tx = new Transaction();
    tx.addInput(
      new Transaction.Input({
        output: new Transaction.Output({
          script: boostJob.toScript(),
          satoshis: boostJob.getValue()
        }),
        prevTxId: boostJob.getTxid(),
        outputIndex: boostJob.getVout(),
        script: bsv.Script.empty()
      })
    );
    // Initialize the Boost Job Proof
    console.log('publicKeyBuffer', toPublicKey.toBuffer().toString('hex'), 'addressBuffer', toPublicKey.toAddress().toBuffer().toString('hex'))
    const jobProof = boost.BoostPowJobProof.fromObject({
      signature: '0000000000000000000000000000000000000000000000000000000000000001',
      minerPubKey: toPublicKey.toBuffer().toString('hex'), //'030511ec53f1cfcb0b348b8349b940900672259a46b78807b80e07aa846f506d32',
      time: '00000000',
      minerNonce: '0000000000000000',
      minerAddress: toPublicKey.toAddress().toBuffer().toString('hex'), // '00a0aa1de2a8c424fa20cf453101125e37d8ac3cf0'
    });
    jobProof.setMinerNonce(cryptoRandomString({length: 16}));
    jobProof.setTime(Math.round((new Date()).getTime() / 1000).toString(16));

    tx.addOutput(
      new Transaction.Output({
        satoshis: boostJob.getValue() - 00,
        script: toPublicKey.toAddress().toBuffer().toString('hex')
      })
    );
    console.log(chalk.green(`Target Difficulty: ${boostJob.getDiff()}`));
    let boostPowString;
    let counter = 0;
    debugLevel = 1;

    while (!boostPowString) {
        jobProof.setMinerNonce(cryptoRandomString({length: 16}));
        // jobProof.setTime(Math.round((new Date()).getTime() / 1000).toString(16));
        boostPowString = boost.BoostPowJob.tryValidateJobProof(boostJob, jobProof);
        if (counter++ % 500000 === 0 ) {
            if (debugLevel >= 1) {
                console.log('Hashes checked: ', counter);
            }
        }
    }
    console.log('Found Boost Pow String!', boostPowString.toString(), boostPowString.toObject(), jobProof.toObject());

    console.log(chalk.yellow(boostPowString.toString()));
    console.log('We will create and publish tx later.... Save the above string!');
    /*
    Figure out signing stuff later.


    let newTX;
    while(!newTX){
      newTX = sign(tx, target);
    }*/


    /*if(!!publish){
      try {
        const {data} = await axios.post('https://api.whatsonchain.com/v1/bsv/main/tx/raw', { txhex: newTX.uncheckedSerialize() });
        console.log(chalk.green('Published ' + Buffer.from(newTX._getHash()).reverse().toString('hex')));
      } catch(e) {
        console.log(chalk.red(JSON.stringify({error: e.response.data})));
      }
    } else {
      return;
    }*/
}

start();