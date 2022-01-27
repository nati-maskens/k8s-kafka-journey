const { Kafka } = require('kafkajs')

const kafka = new Kafka({
    clientId: 'my-app',
    brokers: ['localhost:39092']
})

// const producer = kafka.producer()

const consumer = kafka.consumer({ groupId: 'test-group' })

const run = async () => {
    await consumer.connect();
    await consumer.subscribe({ topic: 'test', fromBeginning: true });

    await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
            console.log({
                partition,
                offset: message.offset,
                value: message.value.toString(),
            })
        },
    })

}

run().catch(err => {
    console.log('moo');
    console.error(err);
});
