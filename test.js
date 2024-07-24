import readline from 'node:readline/promises'


const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

while (true) {
  const answer = await rl.question('What is your favorite food? ');

  if (answer === '123')
    exit()
}