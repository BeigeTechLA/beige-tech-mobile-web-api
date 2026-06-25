const { DataTypes } = require('sequelize');
const sequelize = require('../src/db');

const CLIENT_ARCHIVE_COLUMNS = {
  archived_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  archived_by_user_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  archive_reason: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  restored_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  restored_by_user_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
};

async function addColumnIfMissing(queryInterface, tableName, columnName, definition) {
  const table = await queryInterface.describeTable(tableName);
  if (table[columnName]) {
    console.log(`Skipping ${tableName}.${columnName}; already exists`);
    return;
  }

  await queryInterface.addColumn(tableName, columnName, definition);
  console.log(`Added ${tableName}.${columnName}`);
}

async function createHistoryTableIfMissing(queryInterface) {
  const tables = await queryInterface.showAllTables();
  const normalizedTables = tables.map((table) => {
    if (typeof table === 'string') return table;
    return table.tableName || table.TABLE_NAME || table.name;
  });

  if (normalizedTables.includes('user_archive_history')) {
    console.log('Skipping user_archive_history; already exists');
    return;
  }

  await queryInterface.createTable('user_archive_history', {
    history_id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false
    },
    target_type: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    target_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'SET NULL'
    },
    action: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    reason: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    performed_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'RESTRICT'
    },
    performed_by_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    performed_by_role: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    previous_status: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    new_status: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
    }
  });

  await queryInterface.addIndex('user_archive_history', ['target_type', 'target_id'], {
    name: 'idx_archive_history_target'
  });
  await queryInterface.addIndex('user_archive_history', ['user_id'], {
    name: 'idx_archive_history_user'
  });
  await queryInterface.addIndex('user_archive_history', ['action'], {
    name: 'idx_archive_history_action'
  });
  await queryInterface.addIndex('user_archive_history', ['created_at'], {
    name: 'idx_archive_history_created_at'
  });

  console.log('Created user_archive_history');
}

async function run() {
  const queryInterface = sequelize.getQueryInterface();

  try {
    console.log('Running client archive migration...');

    for (const [columnName, definition] of Object.entries(CLIENT_ARCHIVE_COLUMNS)) {
      await addColumnIfMissing(queryInterface, 'clients', columnName, definition);
    }

    await createHistoryTableIfMissing(queryInterface);

    console.log('Client archive migration completed successfully');
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('Client archive migration failed:', error);
    await sequelize.close();
    process.exit(1);
  }
}

run();
