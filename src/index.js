// Import the required modules using ES6 syntax
import { ApiPromise, WsProvider } from '@polkadot/api';

import donationsEwxImage from './donations_substrate.png';
import donationsEvmImage from './donations_evm.png';

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

    document.getElementById('toggleAccountColumn').addEventListener('change', function() {
        // Get all account-column elements
        const accountColumns = document.querySelectorAll('.account-column');
        // Toggle the display style
        accountColumns.forEach(column => {
            column.style.display = this.checked ? '' : 'none';
        });
    });


    google.charts.load('current', {
        'packages':['geochart'],
        'mapsApiKey': 'AIzaSyDFw4E4RUZzdnCapBYY9TdgFv4KSAuHh8U'
    });
    google.charts.setOnLoadCallback(drawRegionsMap);
    drawRegionsMap(locationCounts);

}

function drawRegionsMap(locationCounts) {
    google.charts.load('current', {
        'packages':['geochart'],
        'mapsApiKey': 'AIzaSyDFw4E4RUZzdnCapBYY9TdgFv4KSAuHh8U' // Use your Google Maps API key
    });
    google.charts.setOnLoadCallback(function() {
        drawChart(locationCounts);
    });

    function drawChart(locationCounts) {
        const data = new google.visualization.DataTable();
        data.addColumn('string', 'Country');
        data.addColumn('number', 'Accounts');

        const sortedLocations = Array.from(locationCounts.entries()).sort((a, b) => b[1] - a[1]);
        sortedLocations.forEach(([location, count]) => {
            data.addRow([location, count]);
        });

        const options = {
            backgroundColor: { fill: '#121212' }, // Dark background color
            datalessRegionColor: '#303030', // Color for regions without data
            colorAxis: {
                // Adding intermediate colors for a smoother or more distinct gradient
                colors: ['#e0e0e0', '#ba68c8', '#9c27b0', '#7b1fa2', '#6a1b9a', '#4a148c']
            },
            legend: { textStyle: { color: '#333' } }, // White text for legend
            tooltip: { textStyle: { color: '#333' } } // White text for tooltips
        };

        const chart = new google.visualization.GeoChart(document.getElementById('locationChart'));
        chart.draw(data, options);
    }
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
    console.log(`Reward Period Index: ${index} \nFirst Block: ${firstBlock} \nLast Block: ${lastBlock} \nCurrent Block: ${currentBlock} \nProgress: ${progress.toFixed(2)}% \nEstimated Time to End: \n${hours} hours, ${minutes} minutes`);

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

    // Sort submissions by votes in descending order and then by name in ascending order
    const sortedSubmissions = submissions.sort((a, b) => {
        const votesA = parseInt(a[1].toString());
        const votesB = parseInt(b[1].toString());

        // If votes are equal, sort by name
        if (votesA === votesB) {
            const nameA = inventoryMap.get(a[0].args[2].toString()).friendlyName.toLowerCase();
            const nameB = inventoryMap.get(b[0].args[2].toString()).friendlyName.toLowerCase();
            return nameA.localeCompare(nameB);
        }

        // Otherwise, sort by votes
        return votesB - votesA; // For descending order
    });

    let totalAccounts = 0;

    for (const [key, value] of sortedSubmissions) {
        const accountId = key.args[2].toString(); // Assuming this is the account
        const currentVotes = parseInt(value.toString());
        const maxVotes = 96;
        const threshold = 63;
        const operatorInfo = inventoryMap.get(accountId);

        const row = document.createElement('tr');

        // Create the progress circle cell
        const statusCell = document.createElement('td');
        statusCell.classList.add('progress-column');
        const statusColor = getStatusColor(currentVotes, threshold, remainingTimeInSeconds);
        statusCell.innerHTML = `<svg height="20" width="20">
                                <circle cx="10" cy="10" r="10" fill="${statusColor}" />
                            </svg>`;

        const votesCell = document.createElement('td');
        votesCell.classList.add('votes-column');

        const nameCell = document.createElement('td');
        nameCell.classList.add('name-column');

        const locationCell = document.createElement('td');
        locationCell.classList.add('location-column');

        const accountCell = document.createElement('td');
        accountCell.classList.add('account-column');
        accountCell.style.display = 'none';

        nameCell.textContent = operatorInfo ? operatorInfo.friendlyName : 'Unknown';
        locationCell.textContent = operatorInfo ? operatorInfo.legalLocation : 'Unknown';
        accountCell.textContent = accountId;
        votesCell.textContent = value.toString();

        row.appendChild(statusCell);
        row.appendChild(votesCell);
        row.appendChild(nameCell);
        row.appendChild(locationCell);
        row.appendChild(accountCell);



        // Add progress bar cell
        //const progressCell = document.createElement('td');
        //progressCell.classList.add('progress-column');
        //progressCell.innerHTML = '<div id="progressBar_' + accountId + '" style="width: 100%; height: 20px;"></div>';
        //row.appendChild(progressCell);



        tableBody.appendChild(row);

        // Call function to draw the progress bar
        drawProgressBar(accountId, currentVotes, maxVotes, threshold, remainingTimeInSeconds);


        totalAccounts += 1;
    }

    document.getElementById('totalAccounts').textContent = `Total Accounts: ${totalAccounts}`;

    $('#votesTable').DataTable({
        paging:false,
        order:[[1,'desc']],
    });
}


function getStatusColor(currentVotes, threshold, remainingTime) {
    if (currentVotes >= threshold) {
        return '#00E676'; // Green
    } else if (canReachThreshold(currentVotes, threshold, remainingTime)) {
        return '#FFA726'; // Yellow
    } else {
        return '#FF1744'; // Red
    }
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
        Estimated Time to End: <br>
        ${rewardPeriod.remainingTime.hours} hours, ${rewardPeriod.remainingTime.minutes} minutes (based on 12 seconds per block)
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


function drawProgressBar(accountId, currentVotes, maxVotes = 96, threshold = 63, remainingTime) {
    // Convert currentVotes to a number to ensure accurate calculations
    const votes = Number(currentVotes);

    // Calculate width percentage
    let widthPercentage = Math.min((votes / maxVotes) * 100, 100); // Ensure it does not exceed 100%

    // Determine the progress bar color
    let color = '#FF1744'; // Default to red
    if (votes >= threshold) {
        color = '#00E676'; // Green if votes are above the threshold
    } else if (canReachThreshold(votes, threshold, remainingTime)) {
        color = '#FFA726'; // Yellow if it's possible to reach the threshold within the remaining time
    }

    // Construct the progress bar HTML with the calculated width and color
    const progressBarHtml = `<div style="width: ${widthPercentage}%; height: 20px; background-color: ${color};"></div>`;

    // Find the progress bar container by ID and update its HTML
    const progressBarContainer = document.getElementById('progressBar_' + accountId);
    if (progressBarContainer) {
        progressBarContainer.innerHTML = progressBarHtml;
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


function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(function() {
        alert('Address copied to clipboard!');
    }, function(err) {
        console.error('Could not copy text: ', err);
    });
}

function showQRCode(id) {
    var qrCode = document.getElementById(id);
    if (qrCode.style.display === "none") {
        qrCode.style.display = "block";
    } else {
        qrCode.style.display = "none";
    }
}


document.addEventListener('DOMContentLoaded', () => {

    // Copy to clipboard functionality
    const copyIcons = document.querySelectorAll('.material-symbols-outlined.copy-icon');
    copyIcons.forEach(icon => {
        icon.addEventListener('click', () => {
            const address = icon.getAttribute('data-address');
            copyToClipboard(address);
        });
    });


    const qrIcons = document.querySelectorAll('.material-symbols-outlined.qr_code');
    const qrModal = document.getElementById('qrModal');
    const qrImage = document.getElementById('qrImage');
    const closeBtn = document.querySelector('.close');

    // Function to open the modal with the correct image
    function openQrModal(imagePath) {
        qrImage.src = imagePath;
        qrModal.style.display = "block";
    }

    // Event listeners for the QR icons
    qrIcons.forEach(icon => {
        icon.addEventListener('click', function() {
            // Determine which QR code to display based on the icon clicked
            const address = this.previousElementSibling.getAttribute('data-address');
            if (address === "5D4WvryHkSmFZMrNxLbGT8jtfNiQ5fMFugpvWekafrD7Ums5") {
                openQrModal(donationsEwxImage);
            } else if (address === "0xF34193DD4F7B51CaFb0A037131cDC9b4197F7B4e") {
                openQrModal(donationsEvmImage);
            }
        });
    });

    // Close the modal when clicking on the (x) button
    closeBtn.onclick = function() {
        qrModal.style.display = "none";
    };

    // Close the modal when clicking outside of the modal content
    window.onclick = function(event) {
        if (event.target == qrModal) {
            qrModal.style.display = "none";
        }
    };


    // Call main to initiate data fetching from the chain
    main().catch(console.error);
});