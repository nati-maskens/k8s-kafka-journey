const { Kafka } = require('kafkajs');

const kafka = new Kafka({
    clientId: 'my-app',
    brokers: ['kafka-test-2:9092']
});

const consumer = kafka.consumer({ groupId: 'test-group' })

const run = async () => {

    await consumer.connect();
    await consumer.subscribe({ topic: 'test-topic', fromBeginning: true });

    await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
            console.log({
                partition,
                offset: message.offset,
                key: message.key.toString(),
                value: message.value.toString(),
            })
        },
    })

}

process.on('SIGINT', () => {
    console.log('\nExiting cleanly...');
    consumer.disconnect().then(() => process.exit());
});

run().catch(err => {
    console.log('Known error.');
    console.error(err);
});
