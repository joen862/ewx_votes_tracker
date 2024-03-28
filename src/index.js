// Import the required modules using ES6 syntax
import { ApiPromise, WsProvider } from '@polkadot/api';

async function main () {
    // Initialise the provider to connect to the local node
    const provider = new WsProvider('wss://public-rpc.mainnet.energywebx.com');

    // Create the API and wait until ready
    const api = await ApiPromise.create({ provider });

    // Retrieve the chain & node information information via rpc calls
    await getChainInfo(api);

    // Retrieve the active reward period information
    const activeRewardPeriod = await getActiveRewardPeriod(api);
    displayCurrentRewardPeriod(activeRewardPeriod);

    // Retrieve the number of submissions
    const numberOfSubmissions = await getNumberOfSubmissions(api, activeRewardPeriod.index);

    // Retrieve the worker node operator inventory
    const operatorInventory = await getWorkerNodeOperatorInventory(api);
    const locationCounts = countLocations(operatorInventory);
    drawLocationChart(locationCounts);

    // Update the HTML table with the submissions data
    const remainingTimeInSeconds = calculateRemainingTimeInSeconds(activeRewardPeriod);
    updateTableWithSubmissions(api, numberOfSubmissions, operatorInventory, remainingTimeInSeconds);

}

async function getChainInfo(api) {

    // Retrieve the chain & node information via rpc calls
    const [chain, nodeName, nodeVersion] = await Promise.all([
        api.rpc.system.chain(),
        api.rpc.system.name(),
        api.rpc.system.version()
    ]);

    console.log(`You are connected to chain ${chain} using ${nodeName} v${nodeVersion}`);
}

async function getActiveRewardPeriod(api) {

    // Query the activeRewardPeriodInfo
    const ARP = await api.query.workerNodePallet.activeRewardPeriodInfo();

    // Extract details
    const index = parseInt(ARP.index.toString());
    const firstBlock = parseInt(ARP.firstBlock.toString());
    const length = parseInt(ARP.length.toString());
    const lastBlock = firstBlock + length;

    // Get the current block number
    const currentBlock = parseInt((await api.rpc.chain.getHeader()).number);

    // Calculate the progress
    const progress = ((currentBlock - firstBlock) / length) * 100;

    // Calculate remaining time in seconds
    const remainingBlocks = lastBlock - currentBlock;
    const remainingTimeInSeconds = remainingBlocks * 12; // 12 seconds per block

    // Convert remaining time to hours, minutes, and seconds
    const hours = Math.floor(remainingTimeInSeconds / 3600);
    const minutes = Math.floor((remainingTimeInSeconds % 3600) / 60);

    // Create a result object
    const result = {
        index,
        firstBlock,
        lastBlock,
        currentBlock,
        progress: progress.toFixed(2),
        remainingTime: {
            hours,
            minutes
        }
    };

    // Log the results
    console.log(`Reward Period Index: ${index} \nFirst Block: ${firstBlock} \nLast Block: ${lastBlock} \nCurrent Block: ${currentBlock} \nProgress: ${progress.toFixed(2)}% \nEstimated Time to End: ${hours} hours, ${minutes} minutes`);

    return result;

}

async function getNumberOfSubmissions(api, activeRewardPeriodIndex, account = null) {
    let submissions;

    if (account) {
        // Als account wordt meegegeven, gebruik deze in de query
        submissions = await api.query.workerNodePallet.numberOfSubmissions('smartflow.y24q2', activeRewardPeriodIndex, account);
    } else {
        // Als geen account wordt meegegeven, gebruik de .entries() methode
        submissions = await api.query.workerNodePallet.numberOfSubmissions.entries('smartflow.y24q2', activeRewardPeriodIndex);
    }

    //console.log(JSON.stringify(submissions, null, 4));

    return submissions;
}

// Function to update the HTML table with submission data
async function updateTableWithSubmissions(api, submissions, inventoryMap, remainingTimeInSeconds) {
    const tableBody = document.getElementById('tableBody');
    tableBody.innerHTML = ''; // Clear existing rows

    // Check if submissions is defined and is an array
    if (!Array.isArray(submissions)) {
        console.error('Expected submissions to be an array, but received:', submissions);
        return; // Exit the function if submissions is not an array
    }

    // Sort submissions by votes in descending order
    const sortedSubmissions = submissions.sort((a, b) => {
        const votesA = parseInt(a[1].toString());
        const votesB = parseInt(b[1].toString());
        return votesB - votesA; // For descending order
    });

    let totalAccounts = 0;

    for (const [key, value] of sortedSubmissions) {
        const accountId = key.args[2].toString(); // Assuming this is the account
        const currentVotes = parseInt(value.toString());
        const maxVotes = 96;
        const threshold = 60;
        const operatorInfo = inventoryMap.get(accountId);

        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        const locationCell = document.createElement('td');
        const accountCell = document.createElement('td');
        const votesCell = document.createElement('td');

        nameCell.textContent = operatorInfo ? operatorInfo.friendlyName : 'Unknown';
        locationCell.textContent = operatorInfo ? operatorInfo.legalLocation : 'Unknown';
        accountCell.textContent = accountId;
        votesCell.textContent = value.toString();

        row.appendChild(nameCell);
        row.appendChild(locationCell);
        row.appendChild(accountCell);
        row.appendChild(votesCell);

        // Add progress bar cell
        const progressCell = document.createElement('td');
        progressCell.innerHTML = '<div id="progressBar_' + accountId + '" style="width: 100%; height: 20px;"></div>';
        row.appendChild(progressCell);
        tableBody.appendChild(row);

        // Call function to draw the progress bar
        drawProgressBar(accountId, currentVotes, maxVotes, threshold, remainingTimeInSeconds);


        totalAccounts += 1;
    }

    document.getElementById('totalAccounts').textContent = `Total Accounts: ${totalAccounts}`;

    $('#votesTable').DataTable({
        paging:false,
        order:[[4,'desc']],
    });
}


function displayCurrentRewardPeriod(rewardPeriod) {
    const rewardPeriodDetailsElem = document.getElementById('rewardPeriodDetails');

    // Format the reward period information
    const rewardPeriodInfo = `
        Reward Period Index: ${rewardPeriod.index} <br>
        First Block: ${rewardPeriod.firstBlock} <br>
        Last Block: ${rewardPeriod.lastBlock} <br>
        Current Block: ${rewardPeriod.currentBlock} <br>
        Progress: ${rewardPeriod.progress}% <br>
        Estimated Time to End: ${rewardPeriod.remainingTime.hours} hours, ${rewardPeriod.remainingTime.minutes} minutes (based on 12 seconds per block)
    `;

    // Update the content of the reward period element
    rewardPeriodDetailsElem.innerHTML = rewardPeriodInfo;
}

async function getWorkerNodeOperatorInventory(api) {
    const inventoryEntries = await api.query.workerNodePallet.workerNodeOperatorInventory.entries();
    const inventoryMap = new Map();

    inventoryEntries.forEach(([key, optionValue]) => {
        if (optionValue.isSome) {
            const value = optionValue.unwrap();
            inventoryMap.set(key.args[0].toHuman(), {
                friendlyName: value.friendlyName.toHuman(),
                legalLocation: value.legalLocation.toHuman()
            });
        }
    });

    return inventoryMap;
}

function countLocations(operatorInventory) {
    const locationCounts = new Map();

    operatorInventory.forEach(info => {
        const location = info.legalLocation;
        if (locationCounts.has(location)) {
            locationCounts.set(location, locationCounts.get(location) + 1);
        } else {
            locationCounts.set(location, 1);
        }
    });

    return locationCounts;
}


function drawLocationChart(locationCounts) {
    google.charts.load('current', {'packages':['corechart']});
    google.charts.setOnLoadCallback(function() {
        drawChart(locationCounts);
    });

    function drawChart(locationCounts) {
        // Convert and sort the locationCounts
        const sortedLocations = Array.from(locationCounts.entries()).sort((a, b) => b[1] - a[1]);

        const data = new google.visualization.DataTable();
        data.addColumn('string', 'Location');
        data.addColumn('number', 'Counts');

        sortedLocations.forEach(([location, count]) => {
            data.addRow([location + ' (' + count + ')', count]); // Include count in label
        });

        const options = {
            title: 'Location Statistics',
            pieHole: 0.4,
            pieSliceText: 'value', // Display actual values instead of percentages
            legend: { position: 'right', alignment: 'center' },
            tooltip: { trigger: 'selection' },
            // Additional customization options can be added here
        };

        const chart = new google.visualization.PieChart(document.getElementById('locationChart'));
        chart.draw(data, options);
    }
}

function drawProgressBar(accountId, currentVotes, maxVotes = 96, threshold = 60, remainingTime) {
    google.charts.load('current', {'packages':['corechart']});
    google.charts.setOnLoadCallback(function() {
        drawChart(accountId, currentVotes, maxVotes, threshold, remainingTime);
    });

    function drawChart(accountId, currentVotes, maxVotes, threshold, remainingTime) {
        const data = new google.visualization.DataTable();
        data.addColumn('string', 'Label');
        data.addColumn('number', 'Votes');
        data.addRows([
            ['', currentVotes] // Empty string for label
        ]);

        let color;
        if (currentVotes >= threshold) {
            color = 'green'; // Above threshold
        } else if (canReachThreshold(currentVotes, threshold, remainingTime)) {
            color = 'yellow'; // Can potentially reach threshold
        } else {
            color = 'red'; // Cannot reach threshold
        }

        const options = {
            title: 'Votes Progress',
            bar: { groupWidth: '95%' },
            legend: { position: 'none' },
            hAxis: {
                minValue: 0,
                maxValue: maxVotes,
                textPosition: 'none' // Hide axis labels
            },
            colors: [color]
        };

        const chart = new google.visualization.BarChart(document.getElementById('progressBar_' + accountId));
        chart.draw(data, options);
    }
}


function canReachThreshold(currentVotes, threshold, remainingTime) {
    const secondsPerVote = 15 * 60; // 15 minutes per vote in seconds
    const remainingVotesPossible = Math.floor(remainingTime / secondsPerVote); // Number of votes that can still be cast
    const totalVotesPossible = currentVotes + remainingVotesPossible; // Total votes possible by the end of the period

    return totalVotesPossible >= threshold;
}


function calculateRemainingTimeInSeconds(activeRewardPeriod) {
    // Assuming activeRewardPeriod contains 'lastBlock' and 'currentBlock'
    // and each block represents a fixed time interval (e.g., 12 seconds)

    const blocksPerSecond = 1 / 12; // Assuming 12 seconds per block
    const remainingBlocks = activeRewardPeriod.lastBlock - activeRewardPeriod.currentBlock;

    // Calculate remaining time in seconds
    const remainingTimeInSeconds = remainingBlocks / blocksPerSecond;
    return remainingTimeInSeconds;
}

function aggregateVotes(submissions) {
    const voteRanges = {};
    const maxVotes = 100; // Set maximum votes if needed
    const increment = 5;

    // Initialize voteRanges with increments of 5
    for (let i = 0; i <= maxVotes; i += increment) {
        const rangeKey = `${i}-${i + increment - 1}`;
        voteRanges[rangeKey] = 0;
    }

    submissions.forEach(([key, value]) => {
        const votes = parseInt(value.toString());

        // Determine the range for the current number of votes
        const rangeIndex = Math.floor(votes / increment);
        const lowerBound = rangeIndex * increment;
        const upperBound = lowerBound + increment - 1;
        const rangeKey = `${lowerBound}-${upperBound}`;

        // Increment the count for the range
        if (voteRanges.hasOwnProperty(rangeKey)) {
            voteRanges[rangeKey]++;
        } else {
            // Handle votes that exceed the maximum defined range
            voteRanges[`${maxVotes}+`] = (voteRanges[`${maxVotes}+`] || 0) + 1;
        }
    });

    return voteRanges;
}




main().catch(console.error);