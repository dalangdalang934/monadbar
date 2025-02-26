class App {
    constructor() {
        if (typeof window.ethers === 'undefined') {
            console.error('Ethers.js not loaded');
            return;
        }

        this.provider = null;
        this.signer = null;
        this.recipientAddress = '0x91F0E13B4A91dAE49982516f9d2DfB8419c3adEe';
        this.conversionRate = 20000; 
        this.minAmount = 0.0001; 
        this.maxAmount = 1; 
        this.isProcessing = false; 
        this.lastTransactionTime = null; 
        
        // UI Elements
        this.connectButton = document.getElementById('connect-wallet');
        this.transferButton = document.getElementById('transfer-btn');
        this.amountInput = document.getElementById('eth-amount');
        this.chainSelect = document.getElementById('chain-select');
        this.networkName = document.getElementById('network-name');
        this.gasPrice = document.getElementById('gas-price');
        
        // Monad balance checking functionality
        this.monadAddressInput = document.getElementById('monad-address');
        this.checkBalanceButton = document.getElementById('check-balance');
        this.displayAddress = document.getElementById('display-address');
        this.monadBalance = document.getElementById('monad-balance');
        
        this.notificationElement = document.getElementById('notification');
        this.closeButton = this.notificationElement.querySelector('.close-btn');
        this.closeButton.addEventListener('click', () => this.hideNotification());
        
        this.INVENTORY_ADDRESS = '0x9d0399C22324562E4c27b10A4f59A1550B97eD6A';
        
        this.monadProvider = new ethers.providers.JsonRpcProvider('rpc');
        
        this.updateInventoryBalance();
        
        this.setupTransferListener();
        
        this.connectButton.addEventListener('click', () => this.connectWallet());
        this.transferButton.addEventListener('click', () => this.handleTransfer());
        this.amountInput.addEventListener('input', () => this.updateMonadAmount());
        this.chainSelect.addEventListener('change', () => this.handleChainChange());
        this.chainConfigs = {
            arbitrum: {
                chainId: '0xa4b1',
                name: 'Arbitrum One',
                rpcUrl: 'https://arb1.arbitrum.io/rpc',
                nativeCurrency: {
                    name: 'ETH',
                    symbol: 'ETH',
                    decimals: 18
                }
            },
            optimism: {
                chainId: '0xa',
                name: 'Optimism',
                rpcUrl: 'https://mainnet.optimism.io',
                nativeCurrency: {
                    name: 'ETH',
                    symbol: 'ETH',
                    decimals: 18
                }
            },
            base: {
                chainId: '0x2105',
                name: 'Base',
                rpcUrl: 'https://mainnet.base.org',
                nativeCurrency: {
                    name: 'ETH',
                    symbol: 'ETH',
                    decimals: 18
                }
            }
        };
        
        // Initialize UI elements
        this.monadAmountInput = document.getElementById('monad-amount');
        this.notificationElement = document.getElementById('notification');
        
        // Initialize
        this.init();
        
        // 设置初始链为 Arbitrum
        this.chainSelect.value = 'arbitrum';
        this.handleChainChange();
    }
    
    async init() {
        // 清理之前的状态
        this.provider = null;
        this.signer = null;
        this.connectButton.textContent = 'Connect Wallet';
        this.networkName.textContent = 'Not Connected';
        
        // 检查是否安装了MetaMask
        if (typeof window.ethereum !== 'undefined') {
            // 清除之前的事件监听
            window.ethereum.removeAllListeners('accountsChanged');
            window.ethereum.removeAllListeners('chainChanged');
            
            // 重新添加事件监听
            window.ethereum.on('accountsChanged', () => {
                console.log('Account changed, resetting connection');
                this.handleDisconnect();
                this.init();
            });
            
            window.ethereum.on('chainChanged', () => {
                console.log('Network changed, resetting connection');
                this.handleDisconnect();
                this.init();
            });

            // 检查是否已经连接
            try {
                const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                if (accounts && accounts.length > 0) {
                    console.log('Found existing connection, connecting...');
                    await this.handleConnect(accounts[0]);
                }
            } catch (error) {
                console.error('Error checking existing connection:', error);
                this.handleDisconnect();
            }
        } else {
            this.showNotification('Please install MetaMask!', 'error');
        }
    }

    async handleDisconnect() {
        // 清理所有状态
        this.provider = null;
        this.signer = null;
        this.connectButton.textContent = 'Connect Wallet';
        this.transferButton.disabled = true;
        this.networkName.textContent = 'Not Connected';
        this.gasPrice.textContent = '-';
        
        // 禁用转账按钮和输入
        this.transferButton.disabled = true;
        this.amountInput.disabled = true;
        this.chainSelect.disabled = true;
    }

    async connectWallet() {
        try {
            if (typeof window.ethereum !== 'undefined') {
                // 请求连接钱包
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                await this.handleConnect(accounts[0]);
            } else {
                this.showNotification('Please install MetaMask!', 'error');
            }
        } catch (error) {
            console.error('Connection error:', error);
            if (error.code === 'ACTION_REJECTED') {
                this.showNotification('Connection rejected by user', 'error');
            } else {
                this.showNotification('Failed to connect wallet', 'error');
            }
            this.handleDisconnect();
        }
    }

    async handleConnect(account) {
        try {
            // 初始化provider和signer
            this.provider = new ethers.providers.Web3Provider(window.ethereum);
            this.signer = this.provider.getSigner();
            
            // 验证连接的账户
            const currentAccount = await this.signer.getAddress();
            if (currentAccount.toLowerCase() !== account.toLowerCase()) {
                throw new Error('Account mismatch');
            }

            // 更新UI状态
            this.connectButton.textContent = `${account.slice(0, 6)}...${account.slice(-4)}`;
            
            // 检查库存余额后再决定是否启用转账按钮
            await this.updateInventoryBalance();
            
            this.amountInput.disabled = false;
            this.chainSelect.disabled = false;

            // 获取并显示当前网络
            const network = await this.provider.getNetwork();
            const chainId = '0x' + network.chainId.toString(16);
            
            // 根据chainId匹配网络名称
            let networkName = 'Unknown Network';
            for (const [name, config] of Object.entries(this.chainConfigs)) {
                if (config.chainId === chainId) {
                    networkName = config.name;
                    this.chainSelect.value = name;
                    break;
                }
            }
            
            // 如果是常见网络，使用内置名称
            if (network.name && network.name !== 'unknown') {
                networkName = network.name.charAt(0).toUpperCase() + network.name.slice(1);
            }
            
            this.networkName.textContent = networkName;

            // 获取gas价格
            const gasPrice = await this.provider.getGasPrice();
            this.gasPrice.textContent = `${ethers.utils.formatUnits(gasPrice, 'gwei')} Gwei`;
        } catch (error) {
            console.error('Error in handleConnect:', error);
            this.showNotification('Failed to initialize wallet connection', 'error');
            this.handleDisconnect();
        }
    }

    async validateAmount() {
        const amount = parseFloat(this.amountInput.value) || 0;
        const isValid = amount >= this.minAmount && amount <= this.maxAmount;
        
        this.transferButton.disabled = !isValid || this.isProcessing || !this.provider;
        
        // 更新MON数量显示
        if (amount > 0) {
            const monAmount = amount * this.conversionRate;
            this.monadAmountInput.value = monAmount.toFixed(2);
        } else {
            this.monadAmountInput.value = '0';
        }
        
        // 显示验证消息
        if (amount > 0 && !isValid) {
            if (amount < this.minAmount) {
                this.showNotification(`Minimum amount is ${this.minAmount} ETH`, 'error');
            } else if (amount > this.maxAmount) {
                this.showNotification(`Maximum amount is ${this.maxAmount} ETH`, 'error');
            }
        }
    }

    async handleAmountChange() {
        await this.validateAmount();
    }

    async handleChainChange() {
        if (!window.ethereum) return;

        const selectedChain = this.chainSelect.value;
        const chainConfig = this.chainConfigs[selectedChain];
        
        if (!chainConfig) {
            this.showNotification('Invalid chain selected', 'error');
            return;
        }

        this.isProcessing = true;
        this.transferButton.disabled = true;
        
        try {
            // Request network change
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: chainConfig.chainId }],
            });
            
            // Update network name
            this.networkName.textContent = chainConfig.name;
            
        } catch (switchError) {
            if (switchError.code === 4902) {
                try {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [
                            {
                                chainId: chainConfig.chainId,
                                chainName: chainConfig.name,
                                rpcUrls: [chainConfig.rpcUrl],
                                nativeCurrency: {
                                    name: "Ethereum",
                                    symbol: "ETH",
                                    decimals: 18
                                }
                            },
                        ],
                    });
                    // Update network name after adding network
                    this.networkName.textContent = chainConfig.name;
                } catch (addError) {
                    console.error('Failed to add network:', addError);
                    this.showNotification('Failed to add network: ' + addError.message, 'error');
                }
            } else {
                console.error('Failed to switch network:', switchError);
                this.showNotification('Failed to switch network: ' + switchError.message, 'error');
            }
        } finally {
            this.isProcessing = false;
            await this.validateAmount();
        }
    }

    async handleTransaction(txHash, fromAddress, amount, expectedMon) {
        try {
            // 记录交易信息到控制台
            console.log('Transaction processed:', {
                txHash,
                fromAddress,
                ethAmount: amount,
                monAmount: expectedMon
            });
            
            // 等待一段时间让区块链同步
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // 更新余额显示
            await this.updateInventoryBalance();
            
        } catch (error) {
            console.error('Error handling transaction:', error);
            this.showNotification('Error updating balance after transaction', 'error');
        }
    }

    async handleTransfer() {
        if (this.isProcessing) {
            // 检查上次交易是否已经很久了（超过30秒）
            const currentTime = new Date().getTime();
            if (this.lastTransactionTime && (currentTime - this.lastTransactionTime) > 30000) {
                // 重置状态
                this.isProcessing = false;
                this.lastTransactionTime = null;
            } else {
                this.showNotification('A transaction is already in progress. Please wait...', 'warning');
                return;
            }
        }

        try {
            this.isProcessing = true;
            this.lastTransactionTime = new Date().getTime();
            
            if (!this.provider || !this.signer) {
                throw new Error('Please connect your wallet first');
            }

            // 检查库存余额
            const balance = await this.monadProvider.getBalance(this.INVENTORY_ADDRESS);
            const formattedBalance = parseFloat(ethers.utils.formatEther(balance)).toFixed(4);
            if (parseFloat(formattedBalance) <= 0) {
                throw new Error('Transfer disabled: Insufficient inventory balance');
            }

            const amount = this.amountInput.value;
            if (!amount || parseFloat(amount) <= 0) {
                throw new Error('Please enter a valid amount');
            }

            // 检查转账金额是否在限制范围内
            if (parseFloat(amount) < this.minAmount || parseFloat(amount) > this.maxAmount) {
                throw new Error(`Amount must be between ${this.minAmount} and ${this.maxAmount} ETH`);
            }

            // 获取用户当前余额
            const userBalance = await this.signer.getBalance();
            const amountInWei = ethers.utils.parseEther(amount);
            
            // 估算 gas 费用
            const gasPrice = await this.provider.getGasPrice();
            const gasLimit = 21000; // 标准 ETH 转账的 gas 限制
            const gasCost = gasPrice.mul(gasLimit);
            
            // 检查用户余额是否足够支付转账金额和 gas 费用
            if (userBalance.lt(amountInWei.add(gasCost))) {
                throw new Error('Insufficient balance to cover transfer amount and gas fees');
            }

            // 显示处理中的提示
            this.showNotification('Processing transfer...', 'info');
            
            // 执行转账到收款地址
            const tx = await this.signer.sendTransaction({
                to: this.recipientAddress,
                value: amountInWei,
                gasLimit: gasLimit,
                gasPrice: gasPrice
            });

            // 显示交易已发送的通知
            this.showNotification(`Transaction sent! Waiting for confirmation...\nHash: ${tx.hash}`, 'info');
            console.log('Transaction sent:', tx.hash);

            // 等待交易确认
            const receipt = await tx.wait();
            
            // 计算预期的 MON 数量
            const expectedMon = parseFloat(amount) * this.conversionRate;
            
            // 显示成功信息
            this.showNotification(
                `Transfer successful!\nAmount: ${amount} ETH\nExpected MON: ${expectedMon}\nHash: ${tx.hash}`,
                'success'
            );

            // 更新库存余额并处理交易记录
            await this.handleTransaction(tx.hash, await this.signer.getAddress(), amount, expectedMon);
            
        } catch (error) {
            console.error('Transfer error:', error);
            
            if (error.code === 'ACTION_REJECTED') {
                this.showNotification('Transaction cancelled by user', 'warning');
            } else {
                this.showNotification(error.message || 'Transfer failed', 'error');
            }
        } finally {
            // 重置处理状态
            this.isProcessing = false;
            this.lastTransactionTime = null;
            
            // 更新UI状态
            await this.updateInventoryBalance();
            await this.validateAmount();
        }
    }
    
    async checkMonadBalance(address) {
        try {
            // 使用QuickNode RPC查询余额
            const balance = await this.monadProvider.getBalance(address);
            
            // 显示地址和余额
            this.displayAddress.textContent = `${address.slice(0, 6)}...${address.slice(-4)}`;
            this.monadBalance.textContent = ethers.utils.formatEther(balance);
        } catch (error) {
            console.error('Error checking balance:', error);
            this.displayAddress.textContent = 'Error';
            this.monadBalance.textContent = '0';
        }
    }
    
    async updateInventoryBalance() {
        if (!this.monadProvider) {
            console.error('Monad provider not initialized');
            return;
        }
        
        try {
            // 获取最新区块号
            const latestBlock = await this.monadProvider.getBlockNumber();
            console.log('Fetching balance at block:', latestBlock);
            
            // 获取余额
            const balance = await this.monadProvider.getBalance(this.INVENTORY_ADDRESS, latestBlock);
            const formattedBalance = parseFloat(ethers.utils.formatEther(balance)).toFixed(4);
            console.log('New inventory balance:', formattedBalance);
            
            if (this.monadBalance) {
                this.monadBalance.textContent = formattedBalance;
                
                // 更新转账按钮状态
                if (parseFloat(formattedBalance) <= 0) {
                    this.transferButton.disabled = true;
                    this.transferButton.classList.add('disabled');
                    this.showNotification('Transfer disabled: Insufficient inventory balance', 'warning');
                } else if (this.provider && this.signer) { // 只有在钱包已连接时才启用
                    this.transferButton.disabled = false;
                    this.transferButton.classList.remove('disabled');
                }

                // 更新余额显示样式
                if (parseFloat(formattedBalance) <= 0) {
                    this.monadBalance.classList.add('low-balance');
                } else {
                    this.monadBalance.classList.remove('low-balance');
                }
            }
        } catch (error) {
            console.error('Error updating inventory balance:', error);
            if (this.monadBalance) {
                this.monadBalance.textContent = 'Error';
                this.monadBalance.classList.add('error');
                this.transferButton.disabled = true;
                this.transferButton.classList.add('disabled');
            }
            this.showNotification('Error fetching inventory balance', 'error');
        }
    }
    
    setupTransferListener() {
        try {
            // 监听发送到库存地址的转账
            this.monadProvider.on({
                address: this.INVENTORY_ADDRESS,
                topics: [
                    ethers.utils.id("Transfer(address,address,uint256)"),
                    null,  // from address (any)
                    ethers.utils.hexZeroPad(this.INVENTORY_ADDRESS, 32)  // to address (our inventory)
                ]
            }, async (log) => {
                console.log('Received transfer to inventory:', log);
                // 等待几个区块确认
                await new Promise(resolve => setTimeout(resolve, 2000));
                await this.updateInventoryBalance();
                this.showNotification('Inventory balance updated', 'info');
            });

            // 监听从库存地址发出的转账
            this.monadProvider.on({
                address: this.INVENTORY_ADDRESS,
                topics: [
                    ethers.utils.id("Transfer(address,address,uint256)"),
                    ethers.utils.hexZeroPad(this.INVENTORY_ADDRESS, 32),  // from address (our inventory)
                    null  // to address (any)
                ]
            }, async (log) => {
                console.log('Detected transfer from inventory:', log);
                // 等待几个区块确认
                await new Promise(resolve => setTimeout(resolve, 2000));
                await this.updateInventoryBalance();
                this.showNotification('Inventory balance updated', 'info');
            });
            
            console.log('Transfer listeners set up successfully');
        } catch (error) {
            console.error('Error setting up transfer listeners:', error);
        }
    }
    
    async updateMonadAmount() {
        try {
            const ethAmount = parseFloat(this.amountInput.value) || 0;
            // 更新兑换比例为 1 ETH = 20000 MON
            const monadAmount = (ethAmount * this.conversionRate).toFixed(2);
            this.monadAmountInput.value = monadAmount;
        } catch (error) {
            console.error('Error updating monad amount:', error);
            this.monadAmountInput.value = '0';
        }
    }
    
    showNotification(message, type = 'info') {
        if (!this.notificationElement) return;
        
        this.notificationElement.className = `notification ${type}`;
        this.notificationElement.querySelector('.notification-message').textContent = message;
        this.notificationElement.style.display = 'flex';
        
        // 如果是成功或警告消息，5秒后自动隐藏
        if (type === 'success' || type === 'warning') {
            setTimeout(() => this.hideNotification(), 5000);
        }
    }
    
    hideNotification() {
        if (this.notificationElement) {
            this.notificationElement.style.display = 'none';
        }
    }
}

// Initialize app when DOM is loaded
const app = new App();
