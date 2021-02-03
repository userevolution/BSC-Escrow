module.exports = {
  compilers: {
    solc: {
      version: '0.7.6',
      settings: {
        optimizer: {
          enabled: true,
          runs: 200,
        },
      },
    },
  },
  plugins: ['solidity-coverage'],
  // eslint-disable-next-line
  test_directory: './test',
};
