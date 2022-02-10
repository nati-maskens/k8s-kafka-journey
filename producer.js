const { Kafka } = require('kafkajs')

const kafka = new Kafka({
    clientId: 'my-app',
    brokers: ['kafka-test-2:9092']
})

const producer = kafka.producer();

const run = async () => {

    // Producing
    await producer.connect()
    await producer.send({
        topic: 'test-topic',
        messages: [
            { value: 'Bimbom' },
        ],
    });

}

run().catch(err => {
    console.log('moo');
    console.error(err);
});
