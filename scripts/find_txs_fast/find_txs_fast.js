/*
 * IMPORTANT NOTE: This script is based on Ross Perkins' code from
 * https://gist.github.com/ross-p/bd5d4258ac23319f363dc75c2b722dd9<Paste>
 */

const Web3 = require('web3');
const program = require('commander');

const get_web3 = require('../../common/get_web3.js');

program
  .version('0.1.0')
  .command('run <networkName> <contractAddress> <functionSelector> <fromBlock> [toBlock] [maxThreads]')
  .action(async (networkName, contractAddress, functionSelector, fromBlock, toBlock, maxThreads) => {

    // Validate input.
    contractAddress = contractAddress.toLowerCase();
    maxThreads = maxThreads ? parseInt(maxThreads, 10) : 10;
    fromBlock = fromBlock ? parseInt(fromBlock, 10) : 0;
    toBlock = toBlock ? toBlock : 'latest';
    // TODO

    // Display info.
    console.log(`Querying events:`);
    console.log(`  networkName:`, networkName);
    console.log(`  contractAddress:`, contractAddress);
    console.log(`  functionSelector:`, functionSelector);
    console.log(`  fromBlock:`, fromBlock);
    console.log(`  toBlock:`, toBlock);
    console.log(`  maxThreads:`, maxThreads);

    // Connect to network.
    const web3 = await get_web3(networkName);

    function scanTransactionCallback(tx, block) {
      if(tx.to && tx.to.toLowerCase() === contractAddress.toLowerCase()) {
        // console.log(`found transaction to contract:`, tx.hash);
        if(tx.input.substring(0, 10) === functionSelector) {
          console.log(`\n`, tx);
        }
      }
    }

    function scanBlockCallback(block) {
      if(block.transactions) {
        for(var i = 0; i < block.transactions.length; i++) {
          var txn = block.transactions[i];
          scanTransactionCallback(txn, block);
        }
      }
    }

    function scanBlockRange(startingBlock, stoppingBlock, callback) {
      console.log(`Scanning block range:`, startingBlock, stoppingBlock);

      if(startingBlock > stoppingBlock) return -1;

      let blockNumber = startingBlock,
          gotError = false,
          numThreads = 0,
          startTime = new Date();

      function getPercentComplete(bn) {
        var t = stoppingBlock - startingBlock,
            n = bn - startingBlock;
        return Math.floor(n / t * 100, 2);
      }

      function exitThread() {
        if(--numThreads == 0) {
          var numBlocksScanned = 1 + stoppingBlock - startingBlock,
              stopTime = new Date(),
              duration = (stopTime.getTime() - startTime.getTime())/1000,
              blocksPerSec = Math.floor(numBlocksScanned / duration, 2),
              msg = `Scanned to block ${stoppingBlock} (${numBlocksScanned} in ${duration} seconds; ${blocksPerSec} blocks/sec).`,
              len = msg.length,
              numSpaces = process.stdout.columns - len,
              spaces = Array(1+numSpaces).join(" ");

          process.stdout.write("\r"+msg+spaces+"\n");
          if(callback) {
            callback(gotError, stoppingBlock);
          }
        }
        return numThreads;
      }

      function asyncScanNextBlock() {
        if(gotError) return exitThread();
        if(blockNumber > stoppingBlock) return exitThread();

        var myBlockNumber = blockNumber++;
        if (myBlockNumber % maxThreads == 0 || myBlockNumber == stoppingBlock) {
          var pctDone = getPercentComplete(myBlockNumber);
          process.stdout.write(`\rScanning block ${myBlockNumber} - ${pctDone} %`);
        }

        web3.eth.getBlock(myBlockNumber, true, (error, block) => {
          if (error) {
            gotError = true;
            console.error("Error:", error);
          } else {
            scanBlockCallback(block);
            asyncScanNextBlock();
          }
        });
      }

      var nt;
      for (nt = 0; nt < maxThreads && startingBlock + nt <= stoppingBlock; nt++) {
        numThreads++;
        asyncScanNextBlock();
      }

      return nt;
    }
    
    // Start scan.
    if(toBlock === 'latest') toBlock = await web3.eth.getBlockNumber();
    scanBlockRange(fromBlock, toBlock);
  });

if(!process.argv.slice(3).length) program.help();
else program.parse(process.argv);