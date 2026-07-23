const { buildShootsReportWorkbook } = require('../services/shoots-report.service');

exports.generateShootsReport = async (req, res) => {
  try {
    const workbook = await buildShootsReportWorkbook();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="Shoots_Report.xlsx"'
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Generate Shoots Report Error:', error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate shoots report',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }

    res.end();
  }
};
