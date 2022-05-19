const { Kafka } = require('kafkajs')

const kafka = new Kafka({
    clientId: 'my-app',
    brokers: ['kafka-test-2:9092']
})

const producer = kafka.producer();

const run = async () => {

    // Producing
    await producer.connect();

    const message = { value: 'Bimbom' };

    // console.log('argv:', process.argv);
    if (process.argv[2]) message.key = process.argv[2];
    if (process.argv[3]) message.value = process.argv[3];

    await producer.send({
        topic: 'test-topic',
        messages: [ message ],
    });
    await producer.disconnect();

}

run().catch(err => {
    console.log('Known error.');
    console.error(err);
});
